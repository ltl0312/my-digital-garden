// 服务端侧的导入常量入口：真正的定义在 shared/import-limits.ts（前后端单源，spec 9.6），
// 这里只做转出，保证 server 侧 import 路径稳定、可被独立 tsc 校验。
export {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_FILES,
  ALLOWED_EXT,
  IMPORT_JOB_TTL_MS,
  MAX_NAME_LENGTH,
  fmtBytes,
  fmtLimit,
  extOf,
  stripExt,
  INVALID_NAME_RE,
  nameFormatProblem
} from '#shared/import-limits'
