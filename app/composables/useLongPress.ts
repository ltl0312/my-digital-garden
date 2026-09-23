// 触屏长按手势（交付物 MOBILE-PARITY §5 ⑤，第 09 / 22 屏）
//
// 规则（已评审确认）：
//   · **仅 `pointerType === 'touch'` 生效** —— 鼠标长按不触发。这样同一段代码绑在结构树行上，
//     桌面端仍严格沿用右键菜单，触摸屏笔记本也不会把「按住不放」误判成唤起操作面板。
//   · 阈值 500ms，与结构树原有长按完全一致 —— 全站只学一套手势词汇（这是选长按而非左滑的核心理由）。
//   · 按下后位移 > 8px 立即取消，视为滚动 / 滑动。与 §5 ⑤「位移 < 8px 判点击」同源。
//   · 触发后吞掉紧随其后的 click：列表行本身是链接，不吞掉就会「唤起面板的同时把笔记打开」。
export interface LongPressOptions {
  /** 长按判定时长（ms） */
  hold?: number
  /** 允许的最大位移（px） */
  move?: number
  /** 触发时的震动反馈时长（ms），不支持则静默跳过 */
  vibrate?: number
}

/** 长按目标元素需要的一层保护：禁止系统长按菜单与文本选择（定义见 main.css） */
export const LONG_PRESS_CLASS = 'lp-guard'

export function useLongPress(
  handler: (el: HTMLElement, e: PointerEvent) => void,
  options: LongPressOptions = {}
) {
  const HOLD_MS = options.hold ?? 500
  const MOVE_PX = options.move ?? 8
  const VIBRATE_MS = options.vibrate ?? 12

  let timer: ReturnType<typeof setTimeout> | null = null
  let startX = 0
  let startY = 0
  let firing = false

  const clear = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const onPointerdown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    // currentTarget 在 setTimeout 回调里会失效，必须在事件同步阶段先取出来
    const el = e.currentTarget as HTMLElement | null
    if (!el) return
    startX = e.clientX
    startY = e.clientY
    firing = false
    clear()
    timer = setTimeout(() => {
      timer = null
      firing = true
      try { (navigator as any).vibrate?.(VIBRATE_MS) } catch { /* 不支持则忽略 */ }
      suppressClick()
      handler(el, e)
    }, HOLD_MS)
  }

  /** 长按触发后吞掉紧随而来的 click。
   *  刻意挂在 **window 捕获阶段**：目标元素上「组件自身监听器」与「透传的 capture 监听器」
   *  谁先执行由注册顺序决定，不可靠；window 捕获一定早于目标元素上的任何监听器，
   *  因此列表行不会在唤起面板的同时把笔记打开。窗口 600ms 后自动解除。 */
  const suppressClick = () => {
    let guard: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      window.removeEventListener('click', stop, true)
      if (guard) clearTimeout(guard)
    }
    const stop = (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
      cleanup()
    }
    guard = setTimeout(cleanup, 600)
    window.addEventListener('click', stop, true)
  }

  const onPointermove = (e: PointerEvent) => {
    if (!timer) return
    if (Math.abs(e.clientX - startX) > MOVE_PX || Math.abs(e.clientY - startY) > MOVE_PX) clear()
  }

  const onPointerup = clear
  const onPointercancel = clear

  /** 长按已触发时吞掉随后的 click（阻止导航 / 选中） */
  const onClickCapture = (e: MouseEvent) => {
    if (!firing) return
    firing = false
    e.preventDefault()
    e.stopPropagation()
  }

  onScopeDispose(clear)

  return { onPointerdown, onPointermove, onPointerup, onPointercancel, onClickCapture }
}
