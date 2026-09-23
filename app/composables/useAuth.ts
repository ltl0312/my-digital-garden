// 登录身份（角色）取数 —— 抗瞬时故障。
//
// 为什么需要兜底：/api/auth/me 偶发失败（网络抖动、服务端繁忙，例如全库重渲染 / 成熟度
// 重算期间的请求高峰）会让 `me` 直接变成 null，于是**按角色渲染的入口集体消失**：
//   图标栏「管理后台」（isAdmin）、侧栏右上「导入 / 新建文件夹」与顶栏「新建」（canManage）。
// 用户看到的现象就是「左边侧边栏的图标有时候会消失」。
//
// 策略：只有服务端**明确回 401/403** 才判定为未登录（并清掉兜底缓存）；
// 其它错误一律退回「上一次成功解析到的身份」，界面不闪、不消失。

export interface Me {
  id?: string
  role: string
  label?: string | null
}

const ME_FALLBACK_KEY = 'garden-me-fallback'

/** 是否为「服务端明确拒绝」类错误（未登录 / 密钥被禁用），而非网络或服务端故障 */
export const isAuthStatusError = (e: any): boolean => {
  const s = e?.statusCode ?? e?.status ?? e?.response?.status
  return s === 401 || s === 403
}

/** 本地兜底缓存（仅客户端；隐私模式下读写失败一律静默降级） */
export const readMeFallback = (): Me | null => {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(ME_FALLBACK_KEY)
    return raw ? (JSON.parse(raw) as Me) : null
  } catch {
    return null
  }
}

export const writeMeFallback = (v: Me | null) => {
  if (!import.meta.client) return
  try {
    if (v) localStorage.setItem(ME_FALLBACK_KEY, JSON.stringify(v))
    else localStorage.removeItem(ME_FALLBACK_KEY)
  } catch {
    /* 忽略：存储不可用不影响主流程 */
  }
}

export const useAuth = () => {
  const requestFetch = useRequestFetch()
  const { data: me, refresh } = useAsyncData<Me | null>('auth-me', async () => {
    try {
      const v = await requestFetch<Me>('/api/auth/me')
      writeMeFallback(v)
      return v
    } catch (e) {
      // 明确未登录：清缓存并如实返回 null
      if (isAuthStatusError(e)) {
        writeMeFallback(null)
        return null
      }
      // 瞬时故障：维持上一次已知身份（无缓存时即 null，与旧行为一致）
      return readMeFallback()
    }
  })
  const isAdmin = computed(() => me.value?.role === 'admin' || me.value?.role === 'root')
  const isRoot = computed(() => me.value?.role === 'root')
  return { me, isAdmin, isRoot, refresh }
}
