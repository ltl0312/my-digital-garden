import { onMounted, watch } from 'vue'

// 侧栏「记住展开状态」的统一实现（目录树 / 标签组共用）。
//
// 为什么需要三层，缺一层就有一类 bug：
// 1. `useState` —— 同一会话内跨组件共享。侧栏三个面板是 `v-if` 切换的，局部 `ref` 会在
//    切走时随组件销毁而丢失，用户看到的现象就是「切一下面板就全变回默认」。
// 2. `localStorage` —— 跨刷新/跨会话。没有它，按 F5 或第二天打开就又是默认折叠。
// 3. **`onMounted` 才读盘** —— SSR 阶段没有 `localStorage`，在 `setup` 里读会让服务端与
//    客户端首帧渲染不同的展开态，Vue 会报 hydration mismatch 并整段重渲染。
//
// 写盘要等「读盘完成」之后：否则首帧的空数组会立刻把上一次存的内容覆盖成 `[]`。

/** 存储在浏览器里的合法值：只认同构的非空字符串，脏值（被手改过的 JSON、旧版本对象）一律丢弃 */
const parseList = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

/**
 * 记住一组字符串（展开的目录路径、展开的标签组名）。
 * @param stateKey   Nuxt `useState` 的键（会话内跨组件共享）
 * @param storageKey `localStorage` 的键（跨刷新）
 */
export function useStickyList(stateKey: string, storageKey: string) {
  const list = useState<string[]>(stateKey, () => [])
  /** 已从 localStorage 读回过：读回前不写盘，避免用空数组覆盖用户存的状态 */
  const restored = useState<boolean>(`${stateKey}:restored`, () => false)

  const persist = () => {
    if (!import.meta.client || !restored.value) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(list.value))
    } catch {
      // 隐私模式 / 配额满：记住状态是锦上添花，写不进去不影响当前会话
    }
  }

  onMounted(() => {
    if (!restored.value) {
      const saved = parseList(localStorage.getItem(storageKey))
      // 只有存过东西才覆盖：否则保留会话内已经点出来的展开态
      if (saved.length) list.value = saved
      restored.value = true
    }
    // 读回后立刻对齐一次：存的是「现在展开着哪些」，与内存状态保持一致
    persist()
  })

  // 整体替换数组，浅监听就够
  watch(list, persist)

  const has = (key: string) => list.value.includes(key)
  const toggle = (key: string) => {
    list.value = has(key) ? list.value.filter((k) => k !== key) : [...list.value, key]
  }
  const add = (keys: string[]) => {
    const next = new Set(list.value)
    keys.forEach((k) => next.add(k))
    if (next.size !== list.value.length) list.value = [...next]
  }
  const clear = () => { list.value = [] }

  return { list, has, toggle, add, clear }
}

/**
 * 记住一个布尔开关（目录树「提升根」的折叠态）。
 * 与 `useStickyList` 同样的三层理由，只是值只有一个。
 */
export function useStickyFlag(stateKey: string, storageKey: string) {
  const flag = useState<boolean>(stateKey, () => false)
  const restored = useState<boolean>(`${stateKey}:restored`, () => false)

  onMounted(() => {
    if (!restored.value) {
      const raw = localStorage.getItem(storageKey)
      if (raw === '1') flag.value = true
      else if (raw === '0') flag.value = false
      restored.value = true
    }
    try { localStorage.setItem(storageKey, flag.value ? '1' : '0') } catch { /* 忽略 */ }
  })

  watch(flag, (v) => {
    if (!import.meta.client || !restored.value) return
    try { localStorage.setItem(storageKey, v ? '1' : '0') } catch { /* 忽略 */ }
  })

  return flag
}
