import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { createError, getCookie, setCookie } from 'h3'
import type { H3Event } from 'h3'
import { prisma } from './db'

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
  if (key.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }
  return key
}

export function setAuthCookie(event: H3Event, keyId: string) {
  setCookie(event, AUTH_COOKIE, signToken({ kid: keyId, exp: Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60 // 30 天
  })
}

export function clearAuthCookie(event: H3Event) {
  setCookie(event, AUTH_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

// 生成授权密钥（16 位大写字母数字）
export function generateKey(): string {
  return randomBytes(12).toString('base64url').toUpperCase().replace(/-/g, 'X').slice(0, 16)
}
