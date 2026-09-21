export const useAuth = () => {
  const requestFetch = useRequestFetch()
  const { data: me, refresh } = useAsyncData('auth-me', () =>
    requestFetch('/api/auth/me').catch(() => null)
  )
  const isAdmin = computed(() => me.value?.role === 'admin' || me.value?.role === 'root')
  const isRoot = computed(() => me.value?.role === 'root')
  return { me, isAdmin, isRoot, refresh }
}
