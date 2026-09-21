// 全局 Toast（spec 7「反馈与状态」：操作结果统一 Toast，成功 / 警告 / 失败三态）
// 容器用 aria-live="polite" 播报；同一时刻最多保留 4 条，自动过期。
export type ToastKind = 'success' | 'warn' | 'error'

export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastState {
  items: ToastItem[]
}

const TTL: Record<ToastKind, number> = {
  success: 2600,
  warn: 4200,
  error: 6000
}

let seq = 0

export const useToast = () => {
  const state = useState<ToastState>('toast-state', () => ({ items: [] }))

  const dismiss = (id: number) => {
    state.value.items = state.value.items.filter(t => t.id !== id)
  }

  const push = (kind: ToastKind, text: string) => {
    const id = ++seq
    // 最新一条在最上面；超出 4 条时丢弃最旧的
    state.value.items = [{ id, kind, text }, ...state.value.items].slice(0, 4)
    if (import.meta.client) setTimeout(() => dismiss(id), TTL[kind])
    return id
  }

  return {
    items: computed(() => state.value.items),
    dismiss,
    push,
    success: (text: string) => push('success', text),
    warn: (text: string) => push('warn', text),
    error: (text: string) => push('error', text)
  }
}
