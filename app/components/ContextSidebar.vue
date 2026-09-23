<script setup lang="ts">
import {
  Filter, FolderTree, Grid2x2, Tags, X, Upload, FolderPlus,
  FilePlus, Pencil, Files, ClipboardPaste, Trash2, Link2, SquareArrowOutUpRight
} from 'lucide-vue-next'
import type { DomainFacet, TagGroup, GraphStats } from '~/composables/useFacets'
import type { MenuItem } from './TreeContextMenu.vue'

// ContextSidebar（spec ch.4/6）：头部（Vault 名 + 计数 + 过滤）· 分段面板（结构 / 领域 / 标签）
// · 剪贴板提示条插槽 · 底部同步状态；宽度由 AppShell 持有并持久化。
interface TreeNode { name: string; type: 'dir' | 'file'; slug?: string; maturity?: string; children?: TreeNode[] }

const props = defineProps<{
  tree: TreeNode[]
  domains: DomainFacet[]
  tagGroups: TagGroup[]
  stats: GraphStats
  totalNotes: number
  canManage: boolean
  activeTag?: string
  activeDir?: string
  currentSlug?: string
}>()

const emit = defineEmits<{
  (e: 'start-resize', ev: PointerEvent): void
  (e: 'import'): void
  /** 新建文件夹到指定父目录（空串 = vault 顶层） */
  (e: 'new-folder', parent: string): void
  /** 在指定目录下新建笔记 */
  (e: 'new-note', parent: string): void
}>()

type Panel = 'tree' | 'domain' | 'tag'
// 面板选择跨组件共享：详情页「在结构树中定位」需要把面板切回「结构」
const panel = useState<Panel>('shell-sidebar-panel', () => 'tree')
const query = ref('')

const PANELS: { key: Panel; label: string; icon: any }[] = [
  { key: 'tree', label: '结构', icon: FolderTree },
  { key: 'domain', label: '领域', icon: Grid2x2 },
  { key: 'tag', label: '标签', icon: Tags }
]

// 过滤：目录递归保留（仅当子节点有命中时），与过滤前行为一致
const filteredTree = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.tree
  const walk = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = []
    for (const n of nodes) {
      if (n.type === 'dir') {
        const children = walk(n.children || [])
        if (children.length) out.push({ ...n, children })
      } else if (n.name.toLowerCase().includes(q) || (n.slug || '').toLowerCase().includes(q)) {
        out.push(n)
      }
    }
    return out
  }
  return walk(props.tree)
})

// ── 结构树右键菜单（spec 6 / 8.9）────────────────────────────
// 角色与结构保护规则与服务端保持一致：服务端始终是权威（前端置灰只是第一道门）
const { actorRole } = useRoles()
const toast = useToast()
const { confirm } = useConfirm()
const requestFetch = useRequestFetch()

/** 结构目录：vault 根 + KnowledgeBase 本身 + KnowledgeBase/NN_* 一层，任何人（含 root）禁改禁删。
 *  必须与服务端 `isStructuralPath`（server/utils/vault.ts）逐字一致 —— 此前前端写成
 *  「任意一层目录都算」（segs.length === 1）且漏了 KnowledgeBase 前缀限定，导致 vault 下
 *  普通目录（如 zrw）的重命名/删除被误禁用。 */
const isStructural = (path: string) => {
  const segs = path.split('/').filter(Boolean)
  if (segs.length === 0) return true
  if (segs.length === 1) return segs[0] === 'KnowledgeBase'
  return segs.length === 2 && segs[0] === 'KnowledgeBase' && /^\d{2}_/.test(segs[1] ?? '')
}

/** 剪贴板（复制 / 粘贴）：跨路由与抽屉共享 */
type ClipItem = { path: string; name: string; isDir: boolean }
const clipboard = useState<ClipItem | null>('shell-tree-clipboard', () => null)

// 菜单双形态（交付物第 09 屏）：鼠标右键 = 跟随鼠标的锚点浮层；触屏长按 = 贴底的拇指可达面板。
// 两者的 items 完全同源（下方 menuItems），**不存在第二套权限判断**。
const menu = ref<{ open: boolean; x: number; y: number; target: any | null; mode: 'mouse' | 'touch' }>({
  open: false, x: 0, y: 0, target: null, mode: 'mouse'
})
const renameOpen = ref(false)
// 重命名目标（对话框需要 isDir / 同级节点做重名校验）
const renameTarget = ref<any | null>(null)
const renameSiblings = computed(() => findSiblings(props.tree, renameTarget.value?.path || ''))
function findSiblings(nodes: TreeNode[], path: string, base = ''): TreeNode[] {
  for (const n of nodes) {
    const p = base ? `${base}/${n.name}` : n.name
    if (n.type === 'dir') {
      if (p === path) return n.children || []
      const deeper = findSiblings(n.children || [], path, p)
      if (deeper.length) return deeper
    }
  }
  return []
}

const openMenu = (
  p: { name: string; path: string; type: 'dir' | 'file'; slug?: string; x: number; y: number; children?: any[] },
  mode: 'mouse' | 'touch' = 'mouse'
) => {
  menu.value = { open: true, x: p.x, y: p.y, target: p, mode }
}
provide('shell-tree-menu', openMenu)

const menuItems = computed<MenuItem[]>(() => {
  const t = menu.value.target
  if (!t) return []
  const isDir = t.type === 'dir'
  const structural = isStructural(t.path)
  const canWrite = props.canManage
  const isRootUser = actorRole.value === 'root'
  const dirEmpty = isDir && !(t.children || []).length
  const clip = clipboard.value

  const items: MenuItem[] = []
  if (!isDir) {
    items.push({ key: 'open', label: '打开', icon: SquareArrowOutUpRight })
  }
  // 「新建」类操作只对目录有意义（对文件操作会把文件路径当目录）
  if (isDir) {
    items.push({
      key: 'new-note', label: '新建笔记', icon: FilePlus,
      disabled: !canWrite, hint: canWrite ? '在该目录下新建一篇笔记' : '当前角色无写入权限'
    })
    items.push({
      key: 'new-folder', label: '新建子文件夹', icon: FolderPlus,
      disabled: !canWrite, hint: canWrite ? '' : '当前角色无写入权限'
    })
  }
  items.push({
    key: 'rename', label: '重命名', icon: Pencil, divider: true,
    disabled: !canWrite || structural,
    hint: structural ? '结构目录受保护，不可重命名' : (canWrite ? '' : '当前角色无写入权限')
  })
  items.push({
    key: 'copy', label: '复制', icon: Files, disabled: !canWrite,
    hint: canWrite ? '复制后可在目标文件夹右键粘贴' : '当前角色无写入权限'
  })
  if (isDir) {
    items.push({
      key: 'paste', label: clip ? `粘贴「${clip.name}」` : '粘贴', icon: ClipboardPaste,
      disabled: !canWrite || !clip, hint: clip ? '' : '剪贴板为空，请先复制一个文件或文件夹'
    })
  }
  items.push({
    key: 'delete', label: '删除', icon: Trash2, danger: true, divider: true,
    disabled: !canWrite || structural || (isDir && !dirEmpty && !isRootUser),
    hint: structural
      ? '结构目录受保护，不可删除'
      : (isDir && !dirEmpty && !isRootUser ? '非空文件夹仅初始管理员可删除' : (canWrite ? '' : '当前角色无写入权限'))
  })
  items.push({ key: 'copy-path', label: '复制路径', icon: Link2, divider: true })
  return items
})

const closeMenu = () => { menu.value = { ...menu.value, open: false } }

const refreshTree = async () => { await refreshNuxtData('vault-tree') }

const onMenuSelect = async (key: string) => {
  const t = menu.value.target
  if (!t) return
  try {
    switch (key) {
      case 'open': {
        const slug = (t.slug || t.path || '')
        await navigateTo(`/notes/${slug.split('/').map(encodeURIComponent).join('/')}`)
        break
      }
      case 'new-note':
        emit('new-note', t.path)
        break
      case 'new-folder':
        emit('new-folder', t.path)
        break
      case 'rename':
        renameTarget.value = t
        renameOpen.value = true
        break
      case 'copy':
        clipboard.value = { path: t.path, name: t.name, isDir: t.type === 'dir' }
        toast.success(`已复制「${t.name}」，到目标文件夹右键粘贴`)
        break
      case 'paste': {
        const clip = clipboard.value
        if (!clip) break
        await requestFetch('/api/vault/copy', { method: 'POST', body: { path: clip.path, targetDir: t.path } })
        await refreshTree()
        toast.success(`已粘贴「${clip.name}」`)
        break
      }
      case 'delete': {
        const ok = await confirm({
          title: t.type === 'dir' ? '删除文件夹' : '删除笔记',
          message: t.type === 'dir'
            ? `确定删除文件夹「${t.name}」及其中的全部笔记吗？此操作不可撤销。`
            : `确定删除笔记「${t.name}」吗？此操作不可撤销。`,
          detail: t.path,
          confirmText: '删除',
          danger: true
        })
        if (!ok) break
        await requestFetch('/api/vault/nodes', { method: 'DELETE', body: { path: t.path } })
        await refreshTree()
        toast.success(`已删除「${t.name}」`)
        break
      }
      case 'copy-path':
        await navigator.clipboard.writeText(t.type === 'dir' ? t.path : (t.slug || t.path))
        toast.success('路径已复制到剪贴板')
        break
    }
  } catch (e: any) {
    toast.error(e?.data?.message || '操作失败')
  }
}

// 重命名对话框的提交结果由 RenameDialog 内部负责 toast 与树刷新
</script>

<template>
  <aside
    class="h-full w-full flex flex-col min-h-0 border-r border-line bg-surface-2"
  >
    <!-- 头部：Vault 名 + 计数 + 过滤 -->
    <div class="px-3 pt-3 pb-2 border-b border-line space-y-2 shrink-0">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-ds-sm font-semibold text-ink truncate">Garden Vault</span>
          <span class="text-xs font-mono text-ink-3 px-1.5 py-0.5 rounded-full bg-surface-3 shrink-0">{{ totalNotes }}</span>
        </div>
        <div v-if="canManage" class="flex items-center gap-1 shrink-0">
          <button
            class="w-7 h-7 rounded-ctl flex items-center justify-center text-ink-3 hover:text-accent hover:bg-surface-3 transition-colors duration-micro"
            title="导入笔记（.md / .markdown / .txt，单文件 ≤ 5MB）"
            @click="emit('import')"
          >
            <Upload class="w-3.5 h-3.5" />
          </button>
          <button
            class="w-7 h-7 rounded-ctl flex items-center justify-center text-ink-3 hover:text-accent hover:bg-surface-3 transition-colors duration-micro"
            title="新建文件夹（vault 顶层）"
            @click="emit('new-folder', '')"
          >
            <FolderPlus class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div class="relative">
        <input
          v-model="query"
          type="text"
          placeholder="过滤笔记…"
          class="w-full bg-surface border border-line rounded-ctl pl-8 pr-7 py-1.5 text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent transition-colors duration-micro"
        />
        <Filter class="w-3.5 h-3.5 absolute left-2.5 top-2 text-ink-3" />
        <button v-if="query" class="absolute right-2 top-2 text-ink-3 hover:text-ink" title="清除" @click="query = ''">
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- 分段面板 -->
    <div class="px-3 py-2 shrink-0">
      <div class="flex items-center gap-0.5 p-0.5 rounded-ctl bg-surface-3" role="tablist">
        <button
          v-for="p in PANELS"
          :key="p.key"
          role="tab"
          :aria-selected="panel === p.key"
          class="flex-1 flex items-center justify-center gap-1 h-7 rounded-[6px] text-xs font-semibold transition-colors duration-micro"
          :class="panel === p.key ? 'bg-surface text-ink shadow-ds1' : 'text-ink-3 hover:text-ink'"
          @click="panel = p.key"
        >
          <component :is="p.icon" class="w-3 h-3" />{{ p.label }}
        </button>
      </div>
    </div>

    <!-- 面板内容（内部滚动） -->
    <div class="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
      <FileTree
        v-if="panel === 'tree'"
        :nodes="filteredTree"
        :can-create="canManage"
        :query="query"
        :current-slug="currentSlug"
      />
      <FacetList v-else-if="panel === 'domain'" :facets="domains" :active-dir="activeDir" />
      <TagGroups v-else :groups="tagGroups" :active-tag="activeTag" />
    </div>

    <!-- 剪贴板提示条（spec 6：复制 / 粘贴的可见状态） -->
    <div
      v-if="clipboard"
      class="px-3 py-2 border-t border-line flex items-center gap-2 shrink-0 bg-[var(--accent-soft)]"
    >
      <ClipboardPaste class="w-3.5 h-3.5 text-accent shrink-0" />
      <span class="flex-1 text-xs text-ink truncate" :title="clipboard.path">已复制：{{ clipboard.name }}</span>
      <button class="text-xs text-ink-3 hover:text-ink shrink-0 transition-colors duration-micro" @click="clipboard = null">
        取消
      </button>
    </div>

    <!-- 结构树操作菜单：鼠标右键走锚点浮层，触屏长按走底部面板（同一份 menuItems） -->
    <TreeContextMenu
      v-if="menu.mode === 'mouse'"
      :open="menu.open"
      :x="menu.x"
      :y="menu.y"
      :items="menuItems"
      @select="onMenuSelect"
      @close="closeMenu"
    />
    <ActionSheet
      v-else
      :open="menu.open"
      :items="menuItems"
      :title="menu.target?.name || ''"
      :subtitle="menu.target?.path || ''"
      @update:open="(v: boolean) => { if (!v) closeMenu() }"
      @select="onMenuSelect"
    />
    <RenameDialog
      v-model:open="renameOpen"
      :path="renameTarget?.path || ''"
      :is-dir="renameTarget?.type === 'dir'"
      :siblings="renameSiblings"
    />

    <!-- 底部同步状态 -->
    <div class="px-3 py-2 border-t border-line text-xs text-ink-3 flex items-center justify-between shrink-0">
      <span class="flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-evergreen animate-pulse"></span>
        Vault Synced
      </span>
      <span class="font-mono tabular-nums">{{ stats.nodes }} 节点 · {{ stats.edges }} 连接</span>
    </div>

    <!-- 拖拽调宽手柄由 AppShell 提供（sidebar 右侧独立 1px 列），此处不再重复 -->
  </aside>
</template>
