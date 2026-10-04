// 图谱节点自定义颜色的**服务端同步存储**（需求：把自定义色跟笔记内容一起同步，同用户同步）。
//
// 数据流：
//   权威 = 服务端 `GraphColor` 表（按访问密钥隔离，见 prisma/schema.prisma）
//   本地 = localStorage 缓存（slug → 颜色），只为在请求回来前先按上次颜色画出来，不闪白
//
// 键用 slug（vault 相对路径）而不是 Note.id：Note.id 是重建库就会变的 uuid，
// slug 才是笔记在图谱里的稳定身份，换设备 / 重建索引后仍能对上。
//
// 写入是**防抖 + 全量提交**：客户端永远把完整状态 PUT 上去，接口按差集落库，
// 因此中途丢包 / 重试都不会写坏数据，也不需要在客户端维护操作日志。

import { normalizeColor } from '#shared/graph-colors'
import {
  clearLegacyNodeColors,
  readLegacyNodeColors,
  readNodeColorsCache,
  writeNodeColorsCache
} from '~/lib/graphState'

/** 提交防抖：连点色板 / 批量上色时合并成一次请求 */
const PUSH_DEBOUNCE_MS = 600

interface ColorsResponse {
  colors: Record<string, string>
  count: number
  updatedAt: string | null
}

export const useGraphColors = () => {
  /** slug → CSS 颜色；权威来自服务端，本地缓存仅作首帧 */
  const colors = ref<Record<string, string>>(readNodeColorsCache())
  const loaded = ref(false)
  const syncing = ref(false)
  /** 有本地改动还没提交成功 */
  const pending = ref(false)
  const error = ref<string | null>(null)
  const lastSyncedAt = ref<string | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<void> | null = null

  const count = computed(() => Object.keys(colors.value).length)

  const persistLocal = () => writeNodeColorsCache(colors.value)

  async function push(): Promise<void> {
    if (inflight) return inflight
    syncing.value = true
    const payload = { ...colors.value }
    const run = (async () => {
      try {
        await $fetch('/api/graph/colors', { method: 'PUT', body: { colors: payload } })
        // 只有服务端确认后才清 pending：期间又改的话 colors 已变，pending 保持为真
        if (JSON.stringify(payload) === JSON.stringify(colors.value)) pending.value = false
        error.value = null
        lastSyncedAt.value = new Date().toISOString()
      } catch (e: unknown) {
        error.value = (e as { message?: string })?.message || '同步失败'
      } finally {
        syncing.value = false
        inflight = null
      }
    })()
    inflight = run
    await run
    // 提交期间用户又改过 → 补一次。
    // 没有这一步，慢网络下「提交中产生的改动」会一直停在 pending 里发不出去
    // （它那次 schedulePush 的定时器已经烧掉了，而 push 又因为 inflight 直接返回）。
    if (pending.value && !timer) {
      timer = setTimeout(() => { timer = null; void push() }, PUSH_DEBOUNCE_MS)
    }
  }

  function schedulePush() {
    pending.value = true
    persistLocal()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void push() }, PUSH_DEBOUNCE_MS)
  }

  /** 立刻把待提交的改动发出去（离开页面 / 切到后台时调用） */
  async function flush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null }
    // 提交期间可能又产生了改动，循环到干净为止（加上限，避免任何情况下的死循环）
    for (let i = 0; i < 5 && pending.value; i++) await push()
  }

  /**
   * 首次装载：先迁移旧版 id 键数据，再以服务端为准合并。
   *
   * 合并规则刻意分两种情况：
   *   - 服务端**空**而本地有数据（迁移来的）：说明这份颜色从没同步过，推上去；
   *   - 服务端**非空**：服务端为准，本地只补服务端没有的键（理论上不会有，兜底）。
   * 反过来（本地覆盖服务端）会让另一台设备上的修改被旧缓存吃掉。
   */
  async function init(nodes: { id: string; slug: string }[]): Promise<void> {
    // 1) 旧版（id 键）→ slug 键，一次性迁移。
    //    只有**确实映射出了条目**才清旧键：图谱数据还没到位时 byId 是空的，
    //    此时清掉就等于把用户的历史颜色直接丢了。
    const migrated: Record<string, string> = {}
    const legacy = readLegacyNodeColors()
    if (Object.keys(legacy).length) {
      const byId = new Map(nodes.map(n => [n.id, n.slug]))
      for (const [id, color] of Object.entries(legacy)) {
        const slug = byId.get(id)
        if (slug) migrated[slug] = color
      }
      if (Object.keys(migrated).length) clearLegacyNodeColors()
    }

    // 2) 拉服务端权威数据
    let server: Record<string, string> = {}
    try {
      const res = await $fetch<ColorsResponse>('/api/graph/colors')
      for (const [slug, color] of Object.entries(res.colors || {})) {
        const c = normalizeColor(color)
        if (slug && c) server[slug] = c
      }
      lastSyncedAt.value = res.updatedAt
      error.value = null
    } catch (e: unknown) {
      // 拉不到就先用本地缓存把图画出来，别让图谱因为同步失败而变灰
      error.value = (e as { message?: string })?.message || '读取自定义颜色失败'
      loaded.value = true
      return
    }

    colors.value = { ...migrated, ...server }
    persistLocal()
    loaded.value = true

    // 迁移出来的数据本地独有 → 立刻推到服务端
    if (Object.keys(migrated).length) {
      pending.value = true
      await push()
    }
  }

  /** 设置 / 清除单个节点的颜色（slug 键，null = 恢复领域色） */
  function set(slug: string, color: string | null) {
    if (!slug) return
    const c = color ? normalizeColor(color) : null
    const next = { ...colors.value }
    if (c) next[slug] = c
    else delete next[slug]
    colors.value = next
    schedulePush()
  }

  /** 批量设置：`{ slug: color|null }`，null 表示清除该节点颜色 */
  function setMany(entries: Record<string, string | null>): number {
    const next = { ...colors.value }
    let changed = 0
    for (const [slug, color] of Object.entries(entries)) {
      if (!slug) continue
      const c = color ? normalizeColor(color) : null
      if (c) {
        if (next[slug] !== c) { next[slug] = c; changed++ }
      } else if (slug in next) {
        delete next[slug]
        changed++
      }
    }
    if (!changed) return 0
    colors.value = next
    schedulePush()
    return changed
  }

  /** 清空全部（服务端也删） */
  async function clearAll(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null }
    // 若正有一次 PUT 在飞，必须等它落地再 DELETE：否则 PUT 可能在 DELETE 之后
    // 才到达服务端，把刚清掉的颜色又写回去（本地 {} 与服务端不一致且无人再提交）。
    if (inflight) await inflight.catch(() => {})
    if (timer) { clearTimeout(timer); timer = null }
    colors.value = {}
    persistLocal()
    syncing.value = true
    try {
      await $fetch('/api/graph/colors', { method: 'DELETE' })
      pending.value = false
      error.value = null
      lastSyncedAt.value = new Date().toISOString()
    } catch (e: unknown) {
      pending.value = true
      error.value = (e as { message?: string })?.message || '同步失败'
    } finally {
      syncing.value = false
    }
  }

  return {
    colors,
    count,
    loaded,
    syncing,
    pending,
    error,
    lastSyncedAt,
    init,
    set,
    setMany,
    clearAll,
    flush,
    push
  }
}
