// 应用内确认对话框（spec 7：危险操作必须二次确认，并在对话框内写明影响范围）
// 用法：const answer = await confirm({ title, message, detail, danger: true })
let resolver: ((v: boolean) => void) | null = null

export interface ConfirmOptions {
  title: string
  message: string
  /** 影响范围（文件名 / 用户 / 路径），等宽展示 */
  detail?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export const useConfirm = () => {
  const state = useState<{ open: boolean; opts: ConfirmOptions | null }>('confirm-state', () => ({
    open: false,
    opts: null
  }))

  /**
   * 结束上一次还没被回答的确认（按「取消」处理）。
   *
   * 为什么必须有这一步：resolver 是模块级单例，而 confirm() 是**异步**契约 ——
   * 调用方 `await confirm(...)` 之后还有关键逻辑（例如「关闭多选器弹窗」）。
   * 如果上一个确认还悬着（用户重复点击、确认框还没答完就换了新的、
   * 或宿主组件被卸载导致没人去 settle），新的 confirm() 一旦直接覆盖 resolver，
   * 旧的那次 Promise **永远不会 resolve**：调用方后半段代码再也不会执行，
   * 表现为「点了按钮之后弹窗不消失，只能手动叉掉」。用户反馈的正是这个现象。
   *
   * 语义选择：新的确认**取代**旧的（旧的一次按取消结束），而不是排队 ——
   * 确认框是模态的，排队会让用户以为点了没反应；而按取消结束既安全
   * （不会误执行危险动作），又保证没有任何调用方被永久挂住。
   */
  const abandonPending = () => {
    if (!resolver) return
    const pending = resolver
    resolver = null
    pending(false)
  }

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    abandonPending()
    state.value = { open: true, opts }
    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  }

  const settle = (v: boolean) => {
    state.value = { open: false, opts: null }
    const pending = resolver
    resolver = null
    pending?.(v)
  }

  /** 宿主卸载时调用：不留悬空的 Promise（例如路由切换把 ConfirmHost 带走） */
  const cancelPending = () => {
    if (!resolver) return
    state.value = { open: false, opts: null }
    abandonPending()
  }

  return { state, confirm, settle, cancelPending }
}
