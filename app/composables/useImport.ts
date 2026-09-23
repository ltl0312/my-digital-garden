// 批量导入（spec 9）：限制常量、格式化、**纯函数 preflight**、分片上传调度。
// 预检与界面同源（同一个函数既算清单也算结论），避免「界面说通过、服务端说超限」。
// 限制常量来自 shared/import-limits.ts —— 与 server/utils/import-limits.ts 同一份定义。
import {
  MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES, ALLOWED_EXT,
  fmtBytes, fmtLimit, extOf, stripExt, INVALID_NAME_RE
} from '#shared/import-limits'

export interface ImportItem {
  /** 来源相对路径（文件夹导入时含来源层级） */
  relPath: string
  name: string
  size: number
  file: File
}

export interface ImportRow {
  relPath: string
  name: string
  size: number
  dir: string
  destRel: string
  status: 'ok' | 'bad' | 'skip'
  reason?: 'name' | 'type' | 'empty' | 'size' | 'dup' | 'dup-batch'
  why: string
  over?: number
}

export interface ImportBlock {
  kind: 'file' | 'total' | 'dup' | 'name' | 'count'
  title: string
  rows: ImportRow[]
  over?: number
  limit?: number
}

export interface PreflightOptions {
  targetDir: string
  subDir: string
  keepStructure: boolean
  /** 目标目录已存在文件的完整 slug（不含 .md） */
  existingFiles: Set<string>
}

/** 单个文件的落点（与后端 preflight 的 destRel 口径一致） */
export function destRelOf(item: ImportItem, o: PreflightOptions): string {
  const base = [o.targetDir, o.subDir].filter(Boolean).join('/')
  const dirSegs = o.keepStructure
    ? item.relPath.split('/').slice(0, -1).filter(s => s && s !== '.')
    : []
  return [base, ...dirSegs, item.name].filter(Boolean).join('/')
}

/** 预检（纯函数，可单测）：单文件上限 / 文件夹总量上限 / 数量 / 类型 / 非法名 / 同名冲突 */
export function preflight(items: ImportItem[], o: PreflightOptions) {
  const rows: ImportRow[] = []
  const seen = new Set<string>()
  let rawTotal = 0
  let willTotal = 0
  let maxSize = 0

  for (const it of items) {
    const destRel = destRelOf(it, o)
    const dir = destRel.split('/').slice(0, -1).join('/')
    const slug = destRel.replace(/\.(md|markdown|txt)$/i, '')
    const ext = extOf(it.name)
    const row: ImportRow = { relPath: it.relPath, name: it.name, size: it.size, dir, destRel, status: 'ok', why: '' }

    rawTotal += it.size
    if (it.size > maxSize) maxSize = it.size

    if (!it.name || INVALID_NAME_RE.test(it.name)) {
      row.status = 'bad'; row.reason = 'name'; row.why = '文件名含非法字符'
    } else if (ALLOWED_EXT.indexOf(ext) < 0) {
      row.status = 'skip'; row.reason = 'type'; row.why = `类型不支持（${ext || '无扩展名'}）`
    } else if (it.size === 0) {
      row.status = 'skip'; row.reason = 'empty'; row.why = '空文件'
    } else if (it.size > MAX_FILE_BYTES) {
      row.status = 'bad'; row.reason = 'size'; row.over = it.size - MAX_FILE_BYTES
      row.why = `超出 ${fmtBytes(row.over)}`
    } else if (o.existingFiles.has(slug)) {
      // 「文件名不可重复」是硬规则，没有 跳过/自动重命名/覆盖 三选一
      row.status = 'bad'; row.reason = 'dup'; row.why = '目标目录已存在同名笔记'
    } else if (seen.has(slug.toLowerCase())) {
      row.status = 'bad'; row.reason = 'dup-batch'; row.why = '本次选择中已有同名文件'
    } else {
      row.status = 'ok'
    }

    if (row.status === 'ok') willTotal += it.size
    seen.add(slug.toLowerCase())
    rows.push(row)
  }

  const ok = rows.filter(r => r.status === 'ok')
  const skip = rows.filter(r => r.status === 'skip')
  const overSize = rows.filter(r => r.reason === 'size')
  const dup = rows.filter(r => r.reason === 'dup' || r.reason === 'dup-batch')
  const badName = rows.filter(r => r.reason === 'name')

  const blocks: ImportBlock[] = []
  if (overSize.length) {
    blocks.push({ kind: 'file', limit: MAX_FILE_BYTES, title: `单个文件不得超过 ${fmtLimit(MAX_FILE_BYTES)}`, rows: overSize })
  }
  if (willTotal > MAX_TOTAL_BYTES) {
    blocks.push({ kind: 'total', limit: MAX_TOTAL_BYTES, title: `单个文件夹总大小不得超过 ${fmtLimit(MAX_TOTAL_BYTES)}`, rows: [], over: willTotal - MAX_TOTAL_BYTES })
  }
  if (dup.length) {
    blocks.push({ kind: 'dup', title: '同一目录下不允许存在同名笔记', rows: dup })
  }
  if (badName.length) {
    blocks.push({ kind: 'name', title: '文件名包含非法字符，无法写入 vault', rows: badName })
  }
  if (ok.length > MAX_FILES) {
    blocks.push({ kind: 'count', title: `单次导入文件数不得超过 ${MAX_FILES} 个`, rows: [], over: ok.length - MAX_FILES })
  }

  return {
    rows,
    blocks,
    ok: blocks.length === 0,
    stats: {
      picked: rows.length,
      willImport: ok.length,
      skipped: skip.length,
      rawTotal,
      willTotal,
      maxSize
    }
  }
}

export interface ImportProgress { uploaded: number; total: number; bytes: number; current: string }

export interface ImportResult {
  ok: boolean
  written: number
  writtenBytes: number
  ingest?: { total: number; ingested: number; failed: string[]; pending: number; elapsedMs: number }
  error?: string
}

const MAX_PARALLEL = 3

/** 上传调度：预检 → 逐文件上传（并发 3）→ 收尾批量入库 */
export async function runImport(
  accepted: { relPath: string; size: number }[],
  files: Map<string, File>,
  jobId: string,
  onProgress?: (p: ImportProgress) => void
): Promise<ImportResult> {
  let uploaded = 0
  let bytes = 0
  let cursor = 0
  const total = accepted.length
  let firstError = ''

  const worker = async () => {
    while (true) {
      const i = cursor++
      const item = accepted[i]
      // 越界即取到 undefined（等价于原 `i >= accepted.length` 的返回条件）
      if (item === undefined) return
      const file = files.get(item.relPath)
      if (!file) continue
      const fd = new FormData()
      fd.append('jobId', jobId)
      fd.append('relPath', item.relPath)
      fd.append('file', file, item.relPath.split('/').pop() || file.name)
      try {
        const res = await $fetch<{ bytes: number }>('/api/vault/import/file', { method: 'POST', body: fd })
        uploaded++
        bytes += res.bytes
        onProgress?.({ uploaded, total, bytes, current: item.relPath })
      } catch (e: any) {
        if (!firstError) firstError = e?.data?.message || '上传失败'
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, total || 1) }, worker))

  if (firstError) {
    return { ok: false, written: uploaded, writtenBytes: bytes, error: firstError }
  }

  try {
    const fin = await $fetch<{ written: number; writtenBytes: number; ingest: ImportResult['ingest'] }>(
      '/api/vault/import/finish',
      { method: 'POST', body: { jobId } }
    )
    return { ok: true, written: fin.written, writtenBytes: fin.writtenBytes, ingest: fin.ingest }
  } catch (e: any) {
    return { ok: false, written: uploaded, writtenBytes: bytes, error: e?.data?.message || '收尾失败' }
  }
}

/** 对话框开关与预填目标目录（顶栏「新建」下拉与结构树入口共用） */
export const useImportDialog = () => {
  const open = useState<boolean>('import-dialog-open', () => false)
  const targetDir = useState<string>('import-dialog-target', () => '')
  const openDialog = (dir = '') => { targetDir.value = dir; open.value = true }
  return { open, targetDir, openDialog }
}
