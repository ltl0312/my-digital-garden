import type { Ref } from 'vue'

// 滚动活动探针（交付物 MOBILE-PARITY §5 ①②）
//
// 只做两件事，都是滚动位置/方向驱动的纯视觉状态：
//   scrolled —— 位移 > 8px，用于 AppBar 底边分隔线渐显
//   hidden   —— FAB 滚动隐藏
//
// FAB 隐藏规则（§5 ②，已评审确认）：向下滚动隐藏；**向上滚动或停止 300ms 即回归**。
// 「停止也回归」是刻意的 —— 只按方向判定的话，用户滑到底部停手时 FAB 会一直缺席。
// 阈值 8px 与 §5 ⑤ 的「位移 <8px 判点击」同源，避免与整行点击抢触发。
export function useScrollActivity(elRef: Ref<HTMLElement | null | undefined>) {
  const scrolled = ref(false)
  const hidden = ref(false)

  let last = 0
  let ticking = false
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const IDLE_MS = 300
  const THRESHOLD = 8

  const clearIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  const measure = () => {
    ticking = false
    const el = elRef.value
    if (!el) return
    const y = el.scrollTop

    scrolled.value = y > THRESHOLD

    if (y <= THRESHOLD) hidden.value = false
    else if (y > last) hidden.value = true
    else hidden.value = false

    last = y

    clearIdle()
    idleTimer = setTimeout(() => {
      hidden.value = false
    }, IDLE_MS)
  }

  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(measure)
  }

  onMounted(() => {
    last = elRef.value?.scrollTop ?? 0
    elRef.value?.addEventListener('scroll', onScroll, { passive: true })
  })
  onBeforeUnmount(() => {
    elRef.value?.removeEventListener('scroll', onScroll)
    clearIdle()
  })

  return { scrolled, hidden }
}
