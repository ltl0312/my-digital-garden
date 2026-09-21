import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { getImportJob, dropImportJob } from '../../../utils/import-job'
import { ingestFiles } from '../../../utils/import-ingest'
import { invalidateGardenCache } from '../../../utils/cache'

// D2 导入收尾（spec 9.6）：返回成功/失败清单，并**主动**对本次写入的文件做一次批量入库，
// 让用户在导入结束后立刻能在目录树与「全部笔记」里看到新笔记（目标 < 30 秒）。
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{ jobId?: string }>(event)) || {}
  const jobId = (body.jobId || '').trim()
  if (!jobId) throw createError({ statusCode: 400, message: '缺少 jobId' })

  const job = getImportJob(jobId)
  if (!job) throw createError({ statusCode: 404, message: '导入会话不存在或已过期（有效期 10 分钟）' })
  if (job.finished) throw createError({ statusCode: 409, message: '该导入会话已结束' })

  job.finished = true
  const accepted = job.accepted.size
  const writtenFiles = [...job.written]
  const writtenBytes = job.writtenBytes

  const result = writtenFiles.length
    ? await ingestFiles(writtenFiles, { concurrency: 8, timeoutMs: 20_000 })
    : { total: 0, ingested: 0, failed: [] as string[], pending: 0, elapsedMs: 0 }

  // 入库完成/超时返回后都失效一次读缓存，保证列表与树立即反映新文件
  invalidateGardenCache()
  dropImportJob(jobId)

  return {
    ok: true,
    accepted,
    written: writtenFiles.length,
    writtenBytes,
    missing: Math.max(0, accepted - writtenFiles.length),
    ingest: result
  }
})
