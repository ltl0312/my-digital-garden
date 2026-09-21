// 轻量进程内缓存（TTL + 手动失效）
// 用途：vault/tree、graph 等"全量计算型"接口避免每次请求重复扫盘/查库。
// 一致性：watcher 完成入库后调用 invalidateGardenCache() 立即失效（见 markdown.ts）。
// 注意：多实例部署时缓存是各进程独立的，失效只影响本进程——配合短 TTL 兜底可接受。

interface CacheEntry<T> { data: T; at: number }

const invalidators = new Set<() => void>()

export function createCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null

  const api = {
    get(): T | null {
      if (!entry) return null
      if (Date.now() - entry.at > ttlMs) {
        entry = null
        return null
      }
      return entry.data
    },
    set(data: T) {
      entry = { data, at: Date.now() }
    },
    invalidate() {
      entry = null
    },
  }

  invalidators.add(api.invalidate)
  return api
}

// 全量失效：watcher 每完成一次入库调用，保证缓存与数据库一致
export function invalidateGardenCache() {
  for (const fn of invalidators) fn()
}
