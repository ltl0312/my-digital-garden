export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  // useRequestFetch：SSR 端自动附加原始请求头（含 cookie），客户端同 $fetch
  const requestFetch = useRequestFetch()
  const me = await requestFetch('/api/auth/me').catch(() => null)
  if (!me) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
  if (to.path.startsWith('/admin') && me.role !== 'admin') {
    return navigateTo('/')
  }
})
