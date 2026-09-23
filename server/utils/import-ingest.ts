// 批量导入后的主动入库（spec 9.6 watcher 那一行）：
// 现有 watcher 是**串行队列 + awaitWriteFinish(1000ms)**，500 个文件意味着至少 500 秒才全部入库，
// 生产环境还开了 usePolling、延迟更高。因此导入完成后对本次写入的文件列表主动并发处理，
// 并把结果标记给 watcher，避免同批文件被事件二次解析。
import { processMarkdownFile } from './markdown'
import { markIngested } from './import-job'

export interface IngestResult {
  total: number
  ingested: number
  failed: string[]
  pending: number
  elapsedMs: number
}

/**
 * 并发入库。默认并发 8；`timeoutMs` 到点即返回剩余数量（未完成的文件继续在后台跑，
 * 由调用方决定是否提示用户稍后再看）。
 */
export async function ingestFiles(
  absPaths: string[],
  opts: { concurrency?: number; timeoutMs?: number } = {}
): Promise<IngestResult> {
  const concurrency = Math.max(1, Math.min(16, opts.concurrency ?? 8))
  const timeoutMs = opts.timeoutMs ?? 0
  const started = Date.now()
  const mdPaths = absPaths.filter(p => p.toLowerCase().endsWith('.md'))

  // 先标记，watcher 的 add/change 事件命中即跳过（避免同一文件两份解析负载）
  markIngested(absPaths)

  const failed: string[] = []
  let cursor = 0
  let ingested = 0
  let timedOut = false

  const worker = async () => {
    while (true) {
      if (timedOut) return
      if (timeoutMs && Date.now() - started > timeoutMs) { timedOut = true; return }
      const i = cursor++
      const target = mdPaths[i]
      // 越界即取到 undefined（等价于原 `i >= mdPaths.length` 的返回条件）
      if (target === undefined) return
      try {
        await processMarkdownFile(target)
        ingested++
      } catch (e) {
        failed.push(target)
        console.error(`[garden] import: 入库失败 ${target}`, e)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, mdPaths.length || 1) }, worker))

  return {
    total: absPaths.length,
    ingested,
    failed,
    pending: timedOut ? Math.max(0, mdPaths.length - ingested - failed.length) : 0,
    elapsedMs: Date.now() - started
  }
}
