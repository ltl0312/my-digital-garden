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

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    state.value = { open: true, opts }
    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  }

  const settle = (v: boolean) => {
    state.value = { open: false, opts: null }
    resolver?.(v)
    resolver = null
  }

  return { state, confirm, settle }
}
