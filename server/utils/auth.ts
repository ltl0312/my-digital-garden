import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { createError, getCookie, setCookie } from 'h3'
import type { H3Event } from 'h3'
import { prisma } from './db'

// 生产环境必须显式配置 AUTH_SECRET：缺失或仍为默认值时启动即失败（fail fast），
// 避免 token 可被伪造的弱配置静默上线
if (
  process.env.NODE_ENV === 'production'
  && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === 'dev-secret-change-me')
) {
  throw new Error('[garden] 生产环境必须配置 AUTH_SECRET（写入 .env，随机长字符串），禁止使用默认密钥')
}

const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me'
export const AUTH_COOKIE = 'garden_token'
export const TOKEN_TTL_DAYS = 30

interface TokenPayload { kid: string; exp: number }

export function signToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expect = createHmac('sha256', SECRET).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload
    // token 内嵌 30 天 exp——过期即要求重新输入密钥（密钥本身不过期）
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// 从请求读取并校验 token → 返回 DB 中的密钥（实时校验 isActive；密钥本身无过期概念）
export async function getAuthKey(event: H3Event) {
  const token = getCookie(event, AUTH_COOKIE)
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload?.kid) return null
  const key = await prisma.accessKey.findUnique({ where: { id: payload.kid } })
  if (!key || !key.isActive) return null
  return key
}

export async function requireAuth(event: H3Event) {
  const key = await getAuthKey(event)
  if (!key) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  // 更新最近使用时间（节流 60 秒）
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await prisma.accessKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
  }
  return key
}

export async function requireAdmin(event: H3Event) {
  const key = await requireAuth(event)
  // 管理动作的执行者 = root（初始管理员）或 admin（普通管理员）；user 一律 403
  if (key.role !== 'admin' && key.role !== 'root') {
    throw createError({ statusCode: 403, message: '当前身份为普通用户，没有管理权限' })
  }
  return key
}

// ---- 阶段 B：三级角色（root / admin / user）二维校验 ----
// spec 8.1–8.5：判定 = 发起者角色 × 目标对象角色，写成返回 { ok, why } 的纯函数。

export type Role = 'root' | 'admin' | 'user'
export const ROLES: readonly Role[] = ['root', 'admin', 'user']

export function isRole(v: unknown): v is Role {
  return v === 'root' || v === 'admin' || v === 'user'
}

interface RoleSubject {
  id: string
  role: string
  isBuiltin?: boolean
}

// 目标是否为受保护的内置初始管理员（role 与 isBuiltin 双重判定，防脏数据绕过）
function isRootTarget(target: RoleSubject): boolean {
  return target.role === 'root' || target.isBuiltin === true
}

// 创建密钥：root 可建 admin/user；admin 仅可建 user；任何人都不能再创建第二个 root
export function canCreate(actor: Pick<RoleSubject, 'role'>, targetRole: string): { ok: boolean; why?: string } {
  if (targetRole === 'root') {
    return { ok: false, why: '越权操作：初始管理员为内置唯一身份，不可创建' }
  }
  if (targetRole !== 'admin' && targetRole !== 'user') {
    return { ok: false, why: '角色非法：仅支持 admin / user' }
  }
  if (actor.role === 'root') return { ok: true }
  if (actor.role === 'admin' && targetRole === 'user') return { ok: true }
  return { ok: false, why: '越权操作：普通管理员仅可创建普通用户密钥' }
}

// 禁用 / 启用：root 可禁 admin/user；admin 仅可禁 user；无人可禁 root；无人可动自己的密钥（防自锁）
export function canToggle(actor: RoleSubject, target: RoleSubject): { ok: boolean; why?: string } {
  if (target.id === actor.id) {
    return { ok: false, why: '越权操作：不能变更自己的密钥状态' }
  }
  if (isRootTarget(target)) {
    return { ok: false, why: '越权操作：初始管理员不可被禁用' }
  }
  if (actor.role === 'root' && (target.role === 'admin' || target.role === 'user')) return { ok: true }
  if (actor.role === 'admin' && target.role === 'user') return { ok: true }
  return { ok: false, why: '越权操作：普通管理员仅可管理普通用户密钥' }
}

// 删除：权限与禁用一致（spec 落地推断 ①），另无人可删 root、无人可删自己
export function canDelete(actor: RoleSubject, target: RoleSubject): { ok: boolean; why?: string } {
  if (target.id === actor.id) {
    return { ok: false, why: '越权操作：不能删除自己正在使用的密钥' }
  }
  if (isRootTarget(target)) {
    return { ok: false, why: '越权操作：初始管理员不可被删除' }
  }
  if (actor.role === 'root' && (target.role === 'admin' || target.role === 'user')) return { ok: true }
  if (actor.role === 'admin' && target.role === 'user') return { ok: true }
  return { ok: false, why: '越权操作：普通管理员仅可管理普通用户密钥' }
}

export function setAuthCookie(event: H3Event, keyId: string) {
  setCookie(event, AUTH_COOKIE, signToken({ kid: keyId, exp: Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // 生产 HTTPS 下强制 Secure，防止 cookie 经明文 HTTP 传输
    secure: process.env.NODE_ENV === 'production',
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60 // 30 天
  })
}

export function clearAuthCookie(event: H3Event) {
  setCookie(event, AUTH_COOKIE, '', {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production', maxAge: 0
  })
}

// 生成授权密钥（16 位大写字母数字）
export function generateKey(): string {
  return randomBytes(12).toString('base64url').toUpperCase().replace(/-/g, 'X').slice(0, 16)
}
