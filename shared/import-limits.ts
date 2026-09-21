// 批量导入的口径常量与格式化工具（spec 9.2）
// 前端（app/composables/useImport.ts）与后端（server/utils/import-limits.ts）**共用本文件**，
// 避免两边阈值漂移导致「界面说通过、服务端说超限」。
// 口径定稿：1024 进制 · 100MB 只统计「待导入文件」（被类型过滤的不计入）。

/** 单个文件上限：5 MB（1 MB = 1024 × 1024 字节，与系统「文件属性」一致） */
export const MAX_FILE_BYTES = 5 * 1024 ** 2
/** 单个文件夹（一次导入会话）总大小上限：100 MB */
export const MAX_TOTAL_BYTES = 100 * 1024 ** 2
/** 单次导入文件数上限 */
export const MAX_FILES = 500
/** 允许导入的扩展名白名单 */
export const ALLOWED_EXT: readonly string[] = ['.md', '.markdown', '.txt']
/** 导入会话（jobId）有效期：10 分钟 */
export const IMPORT_JOB_TTL_MS = 10 * 60 * 1000
/** 名称长度上限（与原型 nameProblem 一致） */
export const MAX_NAME_LENGTH = 80

/** 实测体积：按量级给 1~2 位小数 */
export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(n < 10485760 ? 2 : 1)} MB`
}

/** 阈值展示：整数 MB，不出现 "100.0 MB" 这类冗余精度 */
export function fmtLimit(n: number): string {
  return `${n / 1048576} MB`
}

/** 取小写扩展名（含点） */
export function extOf(name: string | null | undefined): string {
  const s = String(name ?? '')
  const i = s.lastIndexOf('.')
  return i < 0 ? '' : s.slice(i).toLowerCase()
}

/** 去扩展名（文件名主体） */
export function stripExt(name: string | null | undefined): string {
  return String(name ?? '').replace(/\.[^.]+$/, '')
}

/** 文件名非法字符：路径分隔符 + Windows 非法字符 + 控制字符 */
export const INVALID_NAME_RE = /[/\\:*?"<>|\x00-\x1f]/

/** 名称合法性（不含重名判定）：返回空串表示合法 */
export function nameFormatProblem(name: string): string {
  const n = (name ?? '').trim()
  if (!n) return '名称不能为空'
  if (INVALID_NAME_RE.test(n)) return '名称不能包含 \\ / : * ? " < > | 等字符'
  if (n.length > MAX_NAME_LENGTH) return `名称过长（建议 ${MAX_NAME_LENGTH} 字符以内）`
  if (/[. ]$/.test(n)) return '名称不能以点号或空格结尾'
  return ''
}
