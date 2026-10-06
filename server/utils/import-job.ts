// 批量导入会话账本（spec 9.6）：预检通过后发 jobId，逐文件上传按 jobId 累计记账。
// 内存实现：单机部署够用；多实例时各进程独立记账（预检与上传需落在同一实例，
// 与 verify 的限流实现同一取舍）。
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { IMPORT_JOB_TTL_MS } from '#shared/import-limits'

export interface ImportJobFile {
  /** 客户端提供的相对路径（含来源层级） */
  relPath: string
  /** 预检时声明的字节数 */
  size: number
  /** 预期落盘相对路径（vault 内，含目标目录与子目录） */
  destRel: string
}

export interface ImportJob {
  id: string
  targetDir: string
  subDir: string
  createdAt: number
  /** 允许上传的文件（relPath → 预期落盘路径） */
  accepted: Map<string, ImportJobFile>
  /** 已写入的绝对路径（用于批量入库与回滚） */
  written: string[]
  writtenBytes: number
  finished: boolean
}

const jobs = new Map<string, ImportJob>()

/** 近期已由导入链路主动入库的文件：watcher 事件命中即跳过，避免同批文件被二次解析 */
const recentlyIngested = new Map<string, number>()
const RECENT_TTL_MS = 60_000

function sweep() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.createdAt > IMPORT_JOB_TTL_MS) jobs.delete(id)
  }
  for (const [p, t] of recentlyIngested) {
    if (now - t > RECENT_TTL_MS) recentlyIngested.delete(p)
  }
}

export function createImportJob(
  targetDir: string,
  subDir: string,
  accepted: ImportJobFile[]
): ImportJob {
  sweep()
  const job: ImportJob = {
    id: randomUUID(),
    targetDir,
    subDir,
    createdAt: Date.now(),
    accepted: new Map(accepted.map(f => [f.relPath, f])),
    written: [],
    writtenBytes: 0,
    finished: false
  }
  jobs.set(job.id, job)
  return job
}

export function getImportJob(id: string): ImportJob | null {
  sweep()
  return jobs.get(id) ?? null
}

export function dropImportJob(id: string): void {
  jobs.delete(id)
}

/** 越线中止时回滚本 job 已写文件（预检已挡住的情况不会走到这里，此处兜底真实字节数越线） */
export async function rollbackImportJob(job: ImportJob): Promise<void> {
  await Promise.all(job.written.map(p => fs.rm(p, { force: true }).catch(() => {})))
  job.written = []
  job.writtenBytes = 0
  jobs.delete(job.id)
}

/**
 * 标记本批文件已入库：watcher 的 add/change 事件命中后直接跳过。
 * 只用于「批量导入」这类我们自己刚写完、事件必然紧随其后的场景。
 */
export function markIngested(paths: string[]): void {
  const now = Date.now()
  for (const p of paths) recentlyIngested.set(p.replace(/\\/g, '/'), now)
}

/**
 * 命中即「消费」：标记的语义是「我们自己刚写完这个文件，它紧随其后的那一次事件不必再解析」，
 * 而不是「这个路径在 60 秒内一律无视」。
 *
 * 早先的实现只 `has()` 不 `delete()`，于是标记会持续抑制该路径的**所有**事件到 TTL 到期为止；
 * 而 watcher 命中即 `return`、不重排不补发，用户在窗口内的真实编辑就被永久丢弃
 * （表现为「新建笔记后立刻编辑保存，正文没生效」）。TTL 只作为「事件始终没来」时的兜底回收。
 */
export function isRecentlyIngested(filePath: string): boolean {
  sweep()
  const key = filePath.replace(/\\/g, '/')
  const hit = recentlyIngested.has(key)
  if (hit) recentlyIngested.delete(key)
  return hit
}
