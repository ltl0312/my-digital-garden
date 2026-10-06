import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { getImportJob, dropImportJob } from '../../../utils/import-job'
import { ingestFiles } from '../../../utils/import-ingest'
import { invalidateGardenCache } from '../../../utils/cache'
import { autoSuggestRecent, drainSuggestions } from '../../../utils/suggest'

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

  // ── 新导入笔记的标签 / 领域自动分配（需求：导入后自动生成，但**必须审核通过才生效**）──
  // 这里只「排队生成建议」：写入的是 Suggestion 待审区，笔记本身一个字段都不改。
  // 为什么异步：入库（ingestFiles）已经可能耗时 20 秒（超时即返回），
  // 再同步跑一遍判定（含可选的 LLM 调用）会让导入对话框卡住几分钟。
  // 为什么按时间窗查而不是用 ingest 的返回清单：ingest 只回传计数与失败清单，
  // 而「刚入库」的判据（createdAt/updatedAt 都在最近 2 分钟内）已经足够精确，
  // 且天然覆盖了「文件写入成功但入库超时、随后由 watcher 补上」的情况。
  let suggested = 0
  try {
    suggested = await autoSuggestRecent()
    // 踢一次排空：不依赖 2s 防抖窗口，让用户在导入结束后尽快看到待审数量
    setTimeout(() => { void drainSuggestions() }, 0).unref?.()
  } catch (e) {
    // 自动建议是增强能力，失败不能影响导入回执（文件已经写好了）
    console.error('[garden] import: 自动标签建议排队失败', e)
  }

  return {
    ok: true,
    accepted,
    written: writtenFiles.length,
    writtenBytes,
    missing: Math.max(0, accepted - writtenFiles.length),
    ingest: result,
    suggested
  }
})
