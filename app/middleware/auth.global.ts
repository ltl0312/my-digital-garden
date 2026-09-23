import { isAuthStatusError, readMeFallback, type Me } from '~/composables/useAuth'

// 客户端 me 缓存：SPA 导航时避免每个路由都请求 /api/auth/me。
// 仅缓存"已登录"结果（60s）；未登录（null）不缓存，登录成功后可立即生效。
const ME_CACHE_TTL = 60_000
let cachedMe: Me | null = null
let cachedAt = 0

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  // useRequestFetch：SSR 端自动附加原始请求头（含 cookie），客户端同 $fetch
  const requestFetch = useRequestFetch()
  const nuxtApp = useNuxtApp()

  let me: Me | null = null
  let resolved = false

  if (import.meta.client && cachedMe && Date.now() - cachedAt < ME_CACHE_TTL) {
    me = cachedMe
    resolved = true
  }

  if (!resolved) {
    try {
      me = await requestFetch<Me>('/api/auth/me')
      if (me) {
        cachedMe = me
        cachedAt = Date.now()
      }
    } catch (e) {
      if (isAuthStatusError(e)) {
        // 服务端明确拒绝（未登录 / 密钥被禁用）：如实判定未登录
        me = null
        cachedMe = null
      } else {
        // 瞬时故障（网络抖动 / 服务端繁忙，如全库重渲染期间）：**绝不能把已登录用户
        // 踢回登录页**（用户看到的正是「界面突然变样、图标消失」）。改用已有依据维持登录态，
        // 优先级：SSR 已解析的身份（payload，最权威）> 上次成功 > 本地兜底缓存。
        const payloadData = (nuxtApp.payload?.data || {}) as Record<string, Me | null | undefined>
        if (Object.prototype.hasOwnProperty.call(payloadData, 'auth-me')) {
          me = payloadData['auth-me'] ?? null
        } else {
          me = cachedMe ?? readMeFallback()
        }
      }
    }
  }

  if (!me) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
  // 阶段 B（spec 8.3）：/admin 不再做角色重定向——同一路由三形态由页面自身呈现，
  // user 访问 /admin 看到「我的密钥 + 无权限页」；写操作的权限由服务端二维校验兜底。
})
