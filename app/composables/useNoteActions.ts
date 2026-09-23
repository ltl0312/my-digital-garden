// 列表行的逐行长按操作（交付物第 22 屏）
//
// 单源实现：首页「最近更新」与「全部笔记」用的是同一个 NoteRow，但**只有后者启用长按** ——
// 首页那一块是浏览入口，不该出现破坏性操作。动作本体集中在此处，
// 与结构树长按、详情页「更多操作」共用同一套权限收敛规则（服务端始终是权威）。
//
// 面板实例挂在布局根部（NoteActionSheet），任意页面触发后都能弹出。
import { Link2, FileText, FolderTree, Trash2 } from 'lucide-vue-next'

export interface NoteActionRef {
  slug: string
  title: string
}

export interface NoteActionItem {
  key: string
  label: string
  icon?: any
  danger?: boolean
  disabled?: boolean
  hint?: string
  divider?: boolean
}

/** 逐段编码（保留 / 为路径分隔符；整体 encodeURIComponent 会生成 %2F 导致路由失配） */
export const encodeNoteSlug = (slug: string) => slug.split('/').map(encodeURIComponent).join('/')

const SHEET_KEY = 'shell-note-sheet'
/** 数据版本号：删除后自增，由各列表页监听并重新取数
 *  （列表页的数据不是 useAsyncData 托管的，refreshNuxtData 覆盖不到） */
const REV_KEY = 'shell-notes-rev'

export function useNoteActions() {
  const sheet = useState<{ open: boolean; note: NoteActionRef | null }>(SHEET_KEY, () => ({ open: false, note: null }))
  const rev = useState<number>(REV_KEY, () => 0)

  const { canManage } = useRoles()
  const toast = useToast()
  const { confirm } = useConfirm()
  const route = useRoute()

  const sidebarOpen = useState<boolean>('shell-sidebar-open', () => true)
  const sidebarPanel = useState<'tree' | 'domain' | 'tag'>('shell-sidebar-panel', () => 'tree')
  const revealSlug = useState<string>('shell-reveal-slug', () => '')

  const openNoteSheet = (note: NoteActionRef) => {
    sheet.value = { open: true, note }
  }

  /** 关闭但保留 note：面板收起与「选中某项」是两步，动作执行时仍需要它 */
  const closeNoteSheet = () => {
    sheet.value = { ...sheet.value, open: false }
  }

  // 普通用户只保留前两项（只读操作）；写操作整项不出现，而不是置灰后仍占一屏
  const noteSheetItems = computed<NoteActionItem[]>(() => {
    const out: NoteActionItem[] = [
      { key: 'copy-link', label: '复制笔记链接', icon: Link2 },
      { key: 'copy-path', label: '复制文件路径', icon: FileText }
    ]
    if (canManage.value) {
      out.push({ key: 'reveal', label: '在结构树中定位', icon: FolderTree })
      out.push({ key: 'delete', label: '删除笔记', icon: Trash2, danger: true, divider: true })
    }
    return out
  })

  const copyText = async (text: string, tip: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(tip)
    } catch {
      toast.warn(`复制失败，请手动选择：${text}`)
    }
  }

  const runNoteAction = async (key: string) => {
    const note = sheet.value.note
    if (!note) return
    const encoded = encodeNoteSlug(note.slug)
    try {
      if (key === 'copy-link') {
        await copyText(`${location.origin}/notes/${encoded}`, '已复制笔记链接')
      } else if (key === 'copy-path') {
        await copyText(`${note.slug}.md`, '已复制文件路径')
      } else if (key === 'reveal') {
        sidebarPanel.value = 'tree'
        sidebarOpen.value = true
        revealSlug.value = note.slug
        toast.success('已在结构树中定位')
      } else if (key === 'delete') {
        const ok = await confirm({
          title: '删除笔记',
          message: `确定删除「${note.title}」？此操作不可恢复，对应的 vault 文件会被一并移除。`,
          detail: `${note.slug}.md`,
          confirmText: '删除',
          danger: true
        })
        if (!ok) return
        await $fetch(`/api/vault/notes/${encoded}`, { method: 'DELETE' })
        await refreshNuxtData(['vault-tree', 'sidebar-tags', 'sidebar-graph', 'notes-recent', 'graph-data'])
        rev.value++
        toast.success('笔记已删除')
        // 删掉的正是当前打开的笔记 → 退回列表（否则页面会停在一个已不存在的 slug 上）
        if (decodeURIComponent(route.path) === `/notes/${note.slug}`) await navigateTo('/notes')
      }
    } catch (e: any) {
      toast.error(e?.data?.message || '操作失败')
    }
  }

  return { noteSheet: sheet, notesRev: rev, openNoteSheet, closeNoteSheet, noteSheetItems, runNoteAction }
}
