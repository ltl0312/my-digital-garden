// 未保存草稿的本地暂存（localStorage）。
//
// 为什么需要它：编辑态只活在内存里 —— 切篇、误关标签页、刷新都会把它抹掉，
// 用户丢的是几分钟的真实输入，而且过程中没有任何提示。这里把草稿按「篇 + 用户」落盘，
// 下次进入同一篇时能原地恢复。
//
// 为什么按用户区分：同一浏览器可能先后登录过不同账号，而草稿里是 vault 正文原文，
// 串台等于把 A 的内容摆到 B 的编辑器里。
//
// 容错原则：localStorage 可能被隐私模式、配额、手改数据（旧版本结构 / 半截 JSON）破坏，
// 任何一种都只当「没有草稿」，绝不让编辑流程因此抛错。

export interface DraftRecord {
  content: string
  /** 落盘时刻（ISO）；恢复逻辑不依赖它，只用于将来做「草稿有多旧」的提示 */
  savedAt: string
}

const KEY_PREFIX = 'garden:draft'
/** 按键级写盘会拖慢长文输入，攒一小段再落一次 */
const DEBOUNCE_MS = 800

/** 存储键：`garden:draft:<slug>:<userId>`；slug 保留 `/` 作为可读的分级信息 */
export const draftStorageKey = (slug: string, userId: string) =>
  `${KEY_PREFIX}:${slug}:${userId || 'anon'}`

// 防抖句柄按「存储键」存放：同一页面里可能先后存在两篇的待写草稿（切篇那一刻）
const timers = new Map<string, ReturnType<typeof setTimeout>>()

// 每次访问都重新取：SSR 期间没有 window，且隐私模式下访问 localStorage 本身会抛错
const storage = (): Storage | null => {
  if (!import.meta.client) return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const cancelTimer = (key: string) => {
  const t = timers.get(key)
  if (t) {
    clearTimeout(t)
    timers.delete(key)
  }
}

export const useDraft = () => {
  const { me } = useAuth()

  /** 草稿归属人：取不到登录身份时统一落 'anon'，不能让未知身份覆盖真实用户的草稿 */
  const owner = () => me.value?.id || 'anon'

  const keyOf = (slug: string) => draftStorageKey(slug, owner())

  /** 读取；任何异常 / 结构不符一律返回 null（当作从来没有草稿） */
  const read = (slug: string): DraftRecord | null => {
    const s = storage()
    if (!s) return null
    try {
      const raw = s.getItem(keyOf(slug))
      if (!raw) return null
      const parsed = JSON.parse(raw)
      // 兼容只存了裸字符串的早期数据
      if (typeof parsed === 'string') return { content: parsed, savedAt: '' }
      if (!parsed || typeof parsed.content !== 'string') return null
      return {
        content: parsed.content,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : ''
      }
    } catch {
      // 脏数据（手改、截断、别的程序写的同名字段）：直接当没有，并顺手清掉
      try { s.removeItem(keyOf(slug)) } catch { /* 再失败也只能放弃 */ }
      return null
    }
  }

  /** 防抖写入（用户正在输入） */
  const write = (slug: string, content: string) => {
    const s = storage()
    if (!s) return
    const key = keyOf(slug)
    cancelTimer(key)
    timers.set(key, setTimeout(() => {
      timers.delete(key)
      try {
        s.setItem(key, JSON.stringify({ content, savedAt: new Date().toISOString() }))
      } catch { /* 配额满 / 隐私模式：草稿保不住，但不能影响保存主流程 */ }
    }, DEBOUNCE_MS))
  }

  /** 立刻写入：切篇、关闭页面前把待写的最后一次输入落盘，不等防抖 */
  const flush = (slug: string, content: string) => {
    const s = storage()
    if (!s) return
    const key = keyOf(slug)
    cancelTimer(key)
    try {
      s.setItem(key, JSON.stringify({ content, savedAt: new Date().toISOString() }))
    } catch { /* 同上 */ }
  }

  /** 清除：保存成功、主动放弃、恢复后丢弃都要调，否则下次进来会「复活」旧草稿 */
  const clear = (slug: string) => {
    cancelTimer(keyOf(slug))
    const s = storage()
    if (!s) return
    try {
      s.removeItem(keyOf(slug))
    } catch { /* 同上 */ }
  }

  return { read, write, flush, clear, keyOf }
}
