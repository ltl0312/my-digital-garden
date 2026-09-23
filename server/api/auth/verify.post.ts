import { createError, defineEventHandler, readBody, type H3Event } from 'h3'
import { prisma } from '../../utils/db'
import { setAuthCookie } from '../../utils/auth'

// ---- 简单内存限流：登录尝试（按 IP，滑动窗口） ----
// 防御密钥暴力猜测。单机部署下够用；多实例时各进程独立计数（可接受）。
const attempts = new Map<string, number[]>()
const LIMIT = { windowMs: 60_000, max: 10 } // 每 IP 每分钟 10 次

function clientIp(event: H3Event): string {
  // Nginx 反代后取 X-Forwarded-For 首段；直连取 socket 地址
  const fwd = event.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim() ?? ''
    return first || 'unknown'
  }
  return event.node?.req?.socket?.remoteAddress || 'unknown'
}

function checkRateLimit(event: H3Event) {
  const ip = clientIp(event)
  const now = Date.now()
  const arr = (attempts.get(ip) || []).filter(t => now - t < LIMIT.windowMs)
  if (arr.length >= LIMIT.max) {
    throw createError({ statusCode: 429, message: '尝试过于频繁，请 1 分钟后再试' })
  }
  arr.push(now)
  attempts.set(ip, arr)
  // 防内存增长：条目过多时清空全部空窗口记录
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) {
      const last = v[v.length - 1]
      if (last === undefined || now - last > LIMIT.windowMs) attempts.delete(k)
    }
  }
}

export default defineEventHandler(async (event) => {
  checkRateLimit(event)

  const body = await readBody<{ key?: string }>(event)
  const key = (body?.key || '').trim()
  if (!key) throw createError({ statusCode: 400, message: '请输入密钥' })

  const record = await prisma.accessKey.findUnique({ where: { key } })
  if (!record) throw createError({ statusCode: 401, message: '密钥无效' })
  if (!record.isActive) throw createError({ statusCode: 401, message: '密钥已被禁用' })
  // 密钥本身无过期概念（永久有效）；30 天限制作用于登录 token（setAuthCookie 内嵌 exp）

  setAuthCookie(event, record.id)
  await prisma.accessKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
  return { role: record.role, label: record.label }
})
