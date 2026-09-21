import { createError, defineEventHandler, readMultipartFormData } from 'h3'
import path from 'path'
import { resolveVaultPath, ensureDir, writeMarkdownAtomic } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { getImportJob, rollbackImportJob } from '../../../utils/import-job'
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, fmtBytes, fmtLimit } from '../../../utils/import-limits'

// D2 单文件上传（spec 9.6）：逐文件上传而非整包——单个请求体积小、失败可重试、进度天然按文件推进。
// 关键点：Content-Length 与 file.size 都不可信 ⇒ 读完整流后按**真实字节数**复核；
// 累计写入量按 jobId 记账，越线立即回滚本 job 已写文件。
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const parts = await readMultipartFormData(event).catch(() => null)
  if (!parts || !parts.length) throw createError({ statusCode: 400, message: '缺少 multipart/form-data 内容' })

  const field = (name: string): string => {
    const p = parts.find(x => x.name === name && !x.filename)
    return p ? new TextDecoder().decode(p.data).trim() : ''
  }
  function toStringUtf8(u8: Uint8Array): string {
    return new TextDecoder().decode(u8)
  }
  const filePart = parts.find(x => x.filename && x.data)
  if (!filePart) throw createError({ statusCode: 400, message: '缺少文件内容' })

  const jobId = field('jobId')
  const relPath = field('relPath')
  if (!jobId || !relPath) throw createError({ statusCode: 400, message: '缺少 jobId 或 relPath' })

  const job = getImportJob(jobId)
  if (!job) throw createError({ statusCode: 404, message: '导入会话不存在或已过期（有效期 10 分钟）' })
  if (job.finished) throw createError({ statusCode: 409, message: '该导入会话已结束' })

  const declared = job.accepted.get(relPath)
  if (!declared) throw createError({ statusCode: 400, message: `文件未通过预检，拒绝写入：${relPath}` })

  // 真实字节数复核（不看 Content-Length / 前端声明值）
  const bytes = filePart.data.length
  if (bytes > MAX_FILE_BYTES) {
    await rollbackImportJob(job)
    throw createError({
      statusCode: 413,
      message: `单个文件不得超过 ${fmtLimit(MAX_FILE_BYTES)}（实测 ${fmtBytes(bytes)}）`,
      data: { file: relPath, bytes, over: bytes - MAX_FILE_BYTES, rolledBack: true }
    })
  }
  if (job.writtenBytes + bytes > MAX_TOTAL_BYTES) {
    await rollbackImportJob(job)
    throw createError({
      statusCode: 413,
      message: `单个文件夹总大小不得超过 ${fmtLimit(MAX_TOTAL_BYTES)}（本次会话已累计 ${fmtBytes(job.writtenBytes + bytes)}）`,
      data: { total: job.writtenBytes + bytes, over: job.writtenBytes + bytes - MAX_TOTAL_BYTES, rolledBack: true }
    })
  }

  let destFull: string
  try {
    destFull = resolveVaultPath(declared.destRel)
  } catch {
    throw createError({ statusCode: 400, message: `非法落点：${declared.destRel}` })
  }

  await ensureDir(path.dirname(destFull))
  await writeMarkdownAtomic(destFull, toStringUtf8(filePart.data))

  job.written.push(destFull)
  job.writtenBytes += bytes
  return { ok: true, relPath, destRel: declared.destRel, bytes, jobBytes: job.writtenBytes, jobFiles: job.written.length }
})
