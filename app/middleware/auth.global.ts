// 客户端 me 缓存：SPA 导航时避免每个路由都请求 /api/auth/me。
// 仅缓存"已登录"结果（60s）；未登录（null）不缓存，登录成功后可立即生效。
const ME_CACHE_TTL = 60_000
let cachedMe: { role: string; label: string | null } | null = null
let cachedAt = 0

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  // useRequestFetch：SSR 端自动附加原始请求头（含 cookie），客户端同 $fetch
  const requestFetch = useRequestFetch()

  let me: { role: string; label: string | null } | null = null
  if (import.meta.client && cachedMe && Date.now() - cachedAt < ME_CACHE_TTL) {
    me = cachedMe
  } else {
    me = await requestFetch('/api/auth/me').catch(() => null)
    if (me) {
      cachedMe = me
      cachedAt = Date.now()
    }
  }

  if (!me) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
  // 阶段 B（spec 8.3）：/admin 不再做角色重定向——同一路由三形态由页面自身呈现，
  // user 访问 /admin 看到「我的密钥 + 无权限页」；写操作的权限由服务端二维校验兜底。
})
