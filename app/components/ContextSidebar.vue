<script setup lang="ts">
import { Filter, FolderTree, Grid2x2, Tags, X, Upload, FolderPlus } from 'lucide-vue-next'
import type { DomainFacet, TagGroup, GraphStats } from '~/composables/useFacets'

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
  (e: 'new-folder'): void
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
            @click="emit('new-folder')"
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

    <!-- 剪贴板提示条（复制 / 粘贴的可见状态，E3 接入） -->
    <slot name="clipbar"></slot>

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
