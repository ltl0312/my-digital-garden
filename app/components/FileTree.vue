<script setup lang="ts">
import { Folder, FolderOpen, ChevronRight, FileText } from 'lucide-vue-next'

// FileTree（spec ch.6）：单根提升 · 递归计数徽章 · 折叠双重信号（箭头旋转 90° + 文件夹实底着色）
// · 过滤时保留命中子树的父级 · 当前笔记高亮 · 目录内联新建
// 业务函数（新建笔记、名称规则）保持与原实现一致，仅重做视图层。
interface TreeNode {
  name: string
  type: 'dir' | 'file'
  slug?: string
  children?: TreeNode[]
}

const props = defineProps<{
  nodes: TreeNode[]
  canCreate?: boolean
  /** 过滤词：过滤态下自动展开命中路径 */
  query?: string
  /** 当前打开的笔记 slug（用于高亮） */
  currentSlug?: string
  /** 父级路径前缀（递归时传入） */
  base?: string
}>()

const route = useRoute()
const { nameProblem } = useNameRule()
// 右键菜单：FileTree 是自递归组件，逐层 emit 会把事件停在中间层；
// 由 ContextSidebar provide 一个 handler，任意层级直接调用（payload 带节点与鼠标坐标）
type MenuPayload = { name: string; path: string; type: 'dir' | 'file'; slug?: string; x: number; y: number; children?: TreeNode[] }
const openMenu = inject<((p: MenuPayload) => void) | null>('shell-tree-menu', null)
const onContextMenu = (node: TreeNode, path: string, ev: MouseEvent) => {
  if (!openMenu) return
  openMenu({
    name: node.name,
    path,
    type: node.type,
    slug: node.slug,
    x: ev.clientX,
    y: ev.clientY,
    children: node.children
  })
}
// 折叠态必须跨递归层级共享：FileTree 是自递归组件，每个实例各有自己的 setup 作用域，
// 若用局部 ref，则「展开某目录」只对本层生效、子实例仍是全折叠（reveal 会只展开第一层）。
const expandedArr = useState<string[]>('shell-tree-expanded', () => [])
const expanded = computed(() => new Set(expandedArr.value))
const setExpanded = (s: Set<string>) => { expandedArr.value = [...s] }
const creating = ref<string | null>(null)
const newTitle = ref('')
const createError = ref('')
// 「在结构树中定位」（spec 5.4）：由外部写入 slug，本组件展开全部祖先并滚动高亮
const revealSlug = useState<string>('shell-reveal-slug', () => '')
const flashSlug = ref('')

/** 返回从根到该文件的全部祖先目录路径；未命中返回 null */
const chainTo = (nodes: TreeNode[], target: string, base = ''): string[] | null => {
  for (const n of nodes) {
    const p = base ? `${base}/${n.name}` : n.name
    if (n.type === 'dir') {
      const deeper = chainTo(n.children || [], target, p)
      if (deeper) return [p, ...deeper]
    } else if (n.slug === target) {
      return []
    }
  }
  return null
}

const reveal = (target: string) => {
  const chain = chainTo(props.nodes, target)
  if (!chain) return
  const next = new Set(expanded.value)
  chain.forEach(p => next.add(p))
  setExpanded(next)
  flashSlug.value = target
  nextTick(() => {
    const sel = `[data-tree-slug="${target.replace(/"/g, '\\"')}"]`
    document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
  setTimeout(() => { if (flashSlug.value === target) flashSlug.value = '' }, 1800)
}

// 只有最外层实例响应（递归实例带 base）
watch(revealSlug, (v) => {
  if (v && props.base === undefined) reveal(v)
})
onMounted(() => {
  if (props.base === undefined && revealSlug.value) reveal(revealSlug.value)
})

// 单根提升：vault 只有一个顶层目录时，直接展开它（不显示多余的一层）
// 必须限定在最外层实例（props.base === undefined）：FileTree 是自递归组件，子实例的 nodes
// 是该目录的子节点数组，只要某目录「只有一个子目录」，子实例同样满足 length === 1 —— 那个
// 子目录就会被当成提升根而恒展开、点不动（用户反馈的 速记/2026、skills/obsidian-manager
// 折叠不了就是这个原因：它们的父目录下确实只有它们一个子目录）。
const promoted = computed(() => {
  if (props.base === undefined && props.nodes.length === 1 && props.nodes[0].type === 'dir') {
    return { root: props.nodes[0], children: props.nodes[0].children || [] }
  }
  return null
})

// 提升根目录后，子层路径前缀必须带上被提升的根名 —— 否则第二层路径会丢掉第一段
// （例如 03_Knowledge/后端，与树里真实的 vault 相对路径 KnowledgeBase/03_Knowledge/后端 不一致，
//  任何按路径定位/展开的逻辑都会失配）
const rootPath = computed(() => {
  if (!promoted.value) return ''
  const name = promoted.value.root.name
  return props.base ? `${props.base}/${name}` : name
})

/** 节点的完整 vault 相对路径：递归实例用 base，根实例在被提升时用提升后的根路径 */
const pathOf = (node: TreeNode) => {
  const prefix = props.base !== undefined ? props.base : rootPath.value
  return prefix ? `${prefix}/${node.name}` : node.name
}

const activeSlug = computed(() => props.currentSlug || decodeURIComponent(route.path.replace(/^\/notes\//, '')))

// 过滤态判定必须用 trim 后的值：传进来的 query 若是空白串（如输入框里只有一个空格），
// 会让每个目录都恒为「展开」且点不动（用户反馈的「文件夹关闭不了」就是这个）
const hasQuery = computed(() => !!props.query?.trim())

// 提升根的默认展开态：默认展开（刷新后依旧展开，避免整棵树空空），但必须能被折叠。
// 不能用 `path === rootPath` 恒真 —— 那样点击 toggle 就完全无效，是死按钮。
const promotedCollapsed = useState<boolean>('shell-promoted-collapsed', () => false)

const isExpanded = (path: string) => {
  if (expanded.value.has(path)) return true
  if (hasQuery.value) return true
  if (promoted.value && path === rootPath.value) return !promotedCollapsed.value
  return false
}

const toggle = (path: string) => {
  const next = new Set(expanded.value)
  // 提升根：翻转「默认展开」标记（同时清掉显式展开记录，保证两次点击状态一致）
  if (promoted.value && props.base === undefined && path === rootPath.value) {
    next.delete(path)
    setExpanded(next)
    promotedCollapsed.value = !promotedCollapsed.value
    return
  }
  if (next.has(path)) next.delete(path)
  else next.add(path)
  setExpanded(next)
}

const countFiles = (children?: TreeNode[]): number => {
  if (!children) return 0
  return children.reduce((acc, c) => acc + (c.type === 'file' ? 1 : countFiles(c.children)), 0)
}

const startCreate = (dir: string) => {
  creating.value = dir
  newTitle.value = ''
  createError.value = ''
}

const submitCreate = async (dir: string, siblings: TreeNode[] = []) => {
  const title = newTitle.value.trim()
  if (!title) return
  // 与导入 / 重命名 / 粘贴共用同一条「同目录不可重名」规则
  const prob = nameProblem(title, siblings as any)
  if (prob) { createError.value = prob; return }
  try {
    const { slug } = await $fetch('/api/vault/notes', { method: 'POST', body: { path: dir, title } })
    creating.value = null
    createError.value = ''
    await refreshNuxtData('vault-tree')
    await navigateTo(`/notes/${slug.split('/').map(encodeURIComponent).join('/')}`)
  } catch (e: any) {
    createError.value = e?.data?.message || '创建失败'
  }
}
</script>

<template>
  <div>
    <!-- 单根提升后的根行（可折叠，计数递归） -->
    <div v-if="promoted" class="mb-0.5">
      <div
        class="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer select-none transition-colors duration-micro"
        :class="isExpanded(rootPath) ? 'text-ink' : 'text-ink-2 hover:text-ink hover:bg-surface-3'"
        :aria-expanded="isExpanded(rootPath)"
        :title="promoted.root.name"
        @click="toggle(rootPath)"
        @contextmenu.prevent="onContextMenu(promoted.root, rootPath, $event)"
      >
        <ChevronRight
          class="w-3 h-3 shrink-0 transition-transform duration-base ease-dawn"
          :class="isExpanded(rootPath) ? 'rotate-90 text-accent' : 'text-ink-3'"
        />
        <FolderOpen v-if="isExpanded(rootPath)" class="w-3.5 h-3.5 text-accent shrink-0" />
        <Folder v-else class="w-3.5 h-3.5 text-ink-3 shrink-0" />
        <span class="flex-1 text-ds-sm font-semibold truncate">{{ promoted.root.name }}</span>
        <span class="text-xs font-mono text-ink-3 tabular-nums px-1.5 rounded-full bg-surface-3">{{ countFiles(promoted.children) }}</span>
      </div>
    </div>

    <ul class="space-y-0.5" :class="promoted ? 'pl-3' : ''">
      <li v-for="node in (promoted ? promoted.children : nodes)" :key="pathOf(node)">
        <!-- 目录 -->
        <div v-if="node.type === 'dir'" class="group">
          <div
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer select-none transition-colors duration-micro"
            :class="isExpanded(pathOf(node)) ? 'text-ink' : 'text-ink-2 hover:text-ink hover:bg-surface-3'"
            :aria-expanded="isExpanded(pathOf(node))"
            :title="node.name"
            @click="toggle(pathOf(node))"
            @contextmenu.prevent="onContextMenu(node, pathOf(node), $event)"
          >
            <!-- 折叠双重信号：箭头旋转 90° + 文件夹实底着色 -->
            <ChevronRight
              class="w-3 h-3 shrink-0 transition-transform duration-base ease-dawn"
              :class="isExpanded(pathOf(node)) ? 'rotate-90 text-accent' : 'text-ink-3'"
            />
            <FolderOpen v-if="isExpanded(pathOf(node))" class="w-3.5 h-3.5 text-accent shrink-0" />
            <Folder v-else class="w-3.5 h-3.5 text-ink-3 shrink-0" />
            <span class="flex-1 text-ds-sm truncate">{{ node.name }}</span>
            <span class="text-xs font-mono text-ink-3 tabular-nums px-1.5 rounded-full bg-surface-3">{{ countFiles(node.children) }}</span>
          </div>

          <div v-if="creating === pathOf(node)" class="pl-6 pr-2 pb-1">
            <input
              v-model="newTitle"
              class="w-full px-2 py-1 rounded-ctl text-ds-sm bg-surface border outline-none"
              :class="createError ? 'border-danger' : 'border-line'"
              placeholder="新笔记标题"
              @keyup.enter="submitCreate(pathOf(node), node.children)"
              @keyup.esc="creating = null"
            />
            <p v-if="createError" class="mt-0.5 text-xs text-danger">{{ createError }}</p>
          </div>

          <div v-if="isExpanded(pathOf(node))" class="mt-0.5 ml-2.5 pl-2.5 border-l border-line">
            <FileTree
              :nodes="node.children || []"
              :can-create="canCreate"
              :query="query"
              :current-slug="currentSlug"
              :base="pathOf(node)"
            />
          </div>
        </div>

        <!-- 文件 -->
        <NuxtLink
          v-else
          :to="`/notes/${(node.slug || '').split('/').map(encodeURIComponent).join('/')}`"
          :data-tree-slug="node.slug"
          class="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-ds-sm transition-colors duration-micro relative"
          :class="[
            activeSlug === node.slug
              ? 'bg-[var(--accent-soft)] text-ink font-semibold'
              : 'text-ink-2 hover:text-ink hover:bg-surface-3',
            flashSlug && flashSlug === node.slug ? 'ring-2 ring-accent' : ''
          ]"
          :title="node.slug"
          @contextmenu.prevent="onContextMenu(node, pathOf(node), $event)"
        >
          <span
            v-if="activeSlug === node.slug"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r bg-accent"
          ></span>
          <FileText class="w-3.5 h-3.5 shrink-0" :class="activeSlug === node.slug ? 'text-accent' : 'text-ink-3'" />
          <span class="flex-1 truncate">{{ node.name }}</span>
          <span
            v-if="node.maturity"
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="node.maturity === 'EVERGREEN' ? 'bg-evergreen' : node.maturity === 'GROWING' ? 'bg-growing' : 'bg-seedling'"
            :title="node.maturity === 'EVERGREEN' ? '常青' : node.maturity === 'GROWING' ? '成长' : '幼苗'"
          ></span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
