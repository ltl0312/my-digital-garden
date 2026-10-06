import { createError, defineEventHandler } from 'h3'
import { getAuthKey, isAdminRole } from '../utils/auth'

const PUBLIC = ['/api/auth/verify', '/api/auth/me', '/api/auth/logout']

/**
 * 管理专属前缀 —— 这些路径下的**任何非只读方法**都必须是 root/admin。
 *
 * 为什么要有全局兜底：需求明确「只有管理员和初始管理员才可以上传笔记，
 * 普通用户永远只有读权限」。此前这条规则靠**每个写接口自己**调 requireAdmin
 * （现状确实都调了），属于「约定」而非「结构」—— 以后新增一个写接口忘了加，
 * 就会静默对普通用户开放。这里加一道前缀级白名单：
 *   · 只读方法（GET/HEAD/OPTIONS）一律放行，读能力对登录用户全开；
 *   · 其余方法落在受管前缀下即要求管理身份，与接口内的 requireAdmin 双重校验。
 * 前缀是**白名单式**的（不在列表里的路径不受影响），因此不会误伤
 * /api/graph/colors 这类按密钥隔离的用户级写入。
 *
 * /api/vault/import/preflight 例外：它只做校验与预检，不写任何文件，
 * 但方法是 POST。列入 READ_ONLY_EXCEPTIONS 以免语义与实现不符。
 */
const ADMIN_ONLY_PREFIXES = [
  '/api/vault/notes',
  '/api/vault/import',
  '/api/vault/folders',
  '/api/vault/nodes',
  '/api/vault/rename',
  '/api/vault/copy',
  '/api/admin'
] as const

/** 前缀内的只读例外（方法虽是写，语义是读） */
const READ_ONLY_EXCEPTIONS = ['/api/vault/import/preflight'] as const

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const

export default defineEventHandler(async (event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) return
  if (PUBLIC.some(p => path.startsWith(p))) return

  const key = await getAuthKey(event)
  if (!key) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const method = (event.method || 'GET').toUpperCase()
  const writeLike = !(SAFE_METHODS as readonly string[]).includes(method)
  const excepted = (READ_ONLY_EXCEPTIONS as readonly string[]).some(p => path.startsWith(p))
  if (writeLike && !excepted && (ADMIN_ONLY_PREFIXES as readonly string[]).some(p => path.startsWith(p))) {
    if (!isAdminRole(key.role)) {
      throw createError({
        statusCode: 403,
        message: '当前身份为普通用户，没有管理权限（普通用户对笔记与知识库只有只读权限）'
      })
    }
  }

  event.context.authKey = key
})
