import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { resolveVaultPath, normalizeVaultRel } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { createImportJob, type ImportJobFile } from '../../../utils/import-job'
import {
  MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES, ALLOWED_EXT,
  fmtBytes, fmtLimit, extOf, nameFormatProblem
} from '../../../utils/import-limits'

interface IncomingFile { relPath?: string; name?: string; size?: number }

// 单文件相对路径安全化：拒绝绝对路径与任何 .. 段（spec 验收 ④ ../../etc/passwd → 400）
function safeRelPath(raw: string): string | null {
  const p = normalizeVaultRel(raw)
  if (!p) return null
  const segs = p.split('/').filter(s => s && s !== '.')
  if (segs.some(s => s === '..')) return null
  if (segs.length > 20) return null
  return segs.join('/')
}

// D2 预检（spec 9.6）：**先校验再上传**，超限/重名/穿越一律 400，不产生任何上传流量。
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{
    targetDir?: string
    subDir?: string
    keepStructure?: boolean
    files?: IncomingFile[]
  }>(event)) || {}

  const targetDir = normalizeVaultRel(body.targetDir || '')
  const subDir = normalizeVaultRel(body.subDir || '')
  const keepStructure = body.keepStructure !== false
  const files = Array.isArray(body.files) ? body.files : []
  if (!files.length) throw createError({ statusCode: 400, message: '请先选择要导入的文件' })

  // 目标目录必须存在（父目录下拉里的项）；子目录名走统一名称规则
  let targetFull: string
  try {
    targetFull = resolveVaultPath(targetDir)
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }
  const tst = await fs.stat(targetFull).catch(() => null)
  if (!tst || !tst.isDirectory()) throw createError({ statusCode: 404, message: '目标目录不存在' })
  if (subDir) {
    const prob = nameFormatProblem(subDir.split('/').pop() || '')
    if (prob) throw createError({ statusCode: 400, message: `新建子文件夹：${prob}` })
    const subFull = resolveVaultPath(subDir)
    const subSt = await fs.stat(subFull).catch(() => null)
    if (subSt && !subSt.isDirectory()) throw createError({ statusCode: 409, message: '同名文件已存在，无法新建子文件夹' })
  }

  const base = [targetDir, subDir].filter(Boolean).join('/')
  const accepted: ImportJobFile[] = []
  const skipped: { relPath: string; size: number; reason: string }[] = []
  const seen = new Set<string>()
  let rawTotal = 0
  let willTotal = 0
  let maxSize = 0

  for (const f of files) {
    const rawRel = String(f.relPath || f.name || '')
    const size = Number.isFinite(f.size) ? Number(f.size) : 0
    rawTotal += size
    if (size > maxSize) maxSize = size

    const rel = safeRelPath(rawRel)
    if (!rel) {
      throw createError({ statusCode: 400, message: `非法路径（不允许越出 vault）：${rawRel}` })
    }
    const fileName = path.posix.basename(rel)
    const ext = extOf(fileName)

    if (nameFormatProblem(fileName)) {
      throw createError({ statusCode: 400, message: `文件名包含非法字符，无法写入 vault：${fileName}` })
    }
    if (ALLOWED_EXT.indexOf(ext) < 0) {
      skipped.push({ relPath: rel, size, reason: `类型不支持（${ext || '无扩展名'}）` })
      continue
    }
    if (size === 0) {
      skipped.push({ relPath: rel, size, reason: '空文件' })
      continue
    }
    if (size > MAX_FILE_BYTES) {
      // 单文件超限：只能先在本地拆分（无法通过分批绕过）—— 提示写明规则、超出量、卡在哪个文件
      throw createError({
        statusCode: 400,
        message: `已阻止导入：单个文件不得超过 ${fmtLimit(MAX_FILE_BYTES)}`,
        data: { rule: 'file-size', file: fileName, size, over: size - MAX_FILE_BYTES }
      })
    }

    const dirSegs = keepStructure ? rel.split('/').slice(0, -1).filter(s => s && s !== '.') : []
    const destRel = [base, ...dirSegs, fileName].filter(Boolean).join('/')
    const dupKey = destRel.toLowerCase()
    if (seen.has(dupKey)) {
      throw createError({
        statusCode: 400,
        message: `已阻止导入：同一目录下不允许存在同名笔记（本次选择中重复）`,
        data: { rule: 'dup-in-batch', file: destRel }
      })
    }
    // 写入前复查目标目录已有文件（与新建/重命名/粘贴共用「同目录不可重名」规则）
    let destFull: string
    try {
      destFull = resolveVaultPath(destRel)
    } catch {
      throw createError({ statusCode: 400, message: `非法路径：${destRel}` })
    }
    const exists = await fs.stat(destFull).then(() => true).catch(() => false)
    if (exists) {
      throw createError({
        statusCode: 400,
        message: '已阻止导入：同一目录下不允许存在同名笔记',
        data: { rule: 'dup-exists', file: destRel, hint: '可在结构树里右键重命名旧笔记，或换一个子文件夹' }
      })
    }
    seen.add(dupKey)
    accepted.push({ relPath: rel, size, destRel })
    willTotal += size
  }

  if (accepted.length > MAX_FILES) {
    throw createError({
      statusCode: 400,
      message: `已阻止导入：单次导入文件数不得超过 ${MAX_FILES} 个`,
      data: { rule: 'count', count: accepted.length, over: accepted.length - MAX_FILES }
    })
  }
  // 100MB 只统计「待导入文件」：被类型过滤掉的根本不会写入 vault，不计入总量
  if (willTotal > MAX_TOTAL_BYTES) {
    throw createError({
      statusCode: 400,
      message: `已阻止导入：单个文件夹总大小不得超过 ${fmtLimit(MAX_TOTAL_BYTES)}`,
      data: { rule: 'total', total: willTotal, over: willTotal - MAX_TOTAL_BYTES, hint: '可以分批导入（每批小于上限）' }
    })
  }
  if (!accepted.length) {
    throw createError({ statusCode: 400, message: '没有可导入的文件（全部被类型或空文件规则跳过）' })
  }

  const job = createImportJob(targetDir, subDir, accepted)
  return {
    jobId: job.id,
    accepted,
    skipped,
    stats: {
      picked: files.length,
      willImport: accepted.length,
      skipped: skipped.length,
      rawTotal,
      willTotal,
      maxSize
    },
    limits: {
      maxFile: MAX_FILE_BYTES,
      maxTotal: MAX_TOTAL_BYTES,
      maxCount: MAX_FILES,
      accept: ALLOWED_EXT,
      maxFileLabel: fmtLimit(MAX_FILE_BYTES),
      maxTotalLabel: fmtLimit(MAX_TOTAL_BYTES),
      willTotalLabel: fmtBytes(willTotal)
    }
  }
})
