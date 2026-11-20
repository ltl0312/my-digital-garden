<script setup lang="ts">
import { Search, Plus, ChevronDown, Menu as MenuIcon, Sun, Moon, X, Settings, KeyRound, LogOut, UserRound } from 'lucide-vue-next'

// AppShell（spec ch.4/6）：图标栏 60px + 顶栏 60px + 主体（上下文侧栏 + 内容区）
// 高度锁 100%，各区域内部滚动；<1024px 侧栏转为抽屉 + 遮罩。
//
// 移动端（交付物 MOBILE-PARITY，阶段 M2）：
//   · <640：底部 Pill TabBar（主导航）+ 顶栏新建 FAB + 顶栏吸顶 + 滚动位移联动
//   · 640–1023：维持 E4 的「抽屉 + 汉堡」形态（底部 TabBar 与 FAB 由 CSS 隐藏）
// 取数逻辑与持久化行为均沿用原实现（同一接口、同一 localStorage 键）。
const { isDark, toggleTheme } = useTheme()
const { me } = useAuth()
const { openDialog: openImportDialog } = useImportDialog()
const { canManage, actorRole } = useRoles()
// 标签 · 领域审核面板：开关在 useSuggestionReview（跨页面单源），
// 因此管理后台与笔记操作面板都能把同一个面板唤起来。
// onlyIds 也要接过来传下去 —— 少了它，「对指定笔记重新判定」后面板会展示全库待审，
// 用户看不到自己刚触发的那一条（实测踩到：面板显示 56 条而不是 1 条）。
const { open: suggestReviewOpen, onlyIds: suggestReviewOnlyIds } = useSuggestionReview()
const onSuggestApplied = async () => {
  // 审核通过会改标签/领域 → 列表、侧栏、首页统计都要重新取数
  await refreshNuxtData(['vault-tree', 'sidebar-tags', 'overview', 'notes-recent'])
}

const commandOpen = useState<boolean>('shell-command-open', () => false)
const createMenuOpen = ref(false)
// 手机 FAB 的弹出层：与顶栏下拉分开持有开合（两者锚点不同），但共用同一套动作实现
const fabMenuOpen = ref(false)
// 详情页编辑态（跨组件）：编辑态让位给编辑器底部操作条 → 隐藏底部 TabBar
const editorOpen = useState<boolean>('shell-editor-open', () => false)

// 顶栏动作插槽（交付物第 04 / 19 屏）：详情页把自己的顶栏按钮（目录 / 更多）Teleport 到这里。
// 必须等 layout 挂载后再渲染 Teleport 内容 —— 目标节点不在 DOM 中时 Vue 会告警并丢弃内容。
const headerActionsReady = useState<boolean>('shell-header-ready', () => false)

// 断点单源 + 滚动活动（交付物 §5 ①②）：断点值不再写字面量
const { isPhone, isNarrow, drawerW } = useViewport()
const scrollEl = ref<HTMLElement | null>(null)
const { scrolled, hidden: fabHidden } = useScrollActivity(scrollEl)

// E4：<1024 图标栏隐藏后，管理后台 / 我的密钥 / 主题 / 退出统一收敛到顶栏「用户」菜单
const userMenuOpen = ref(false)
const roleLabel = computed(() => ROLES[actorRole.value]?.label || '普通用户')
const userMenuItems = computed(() => {
  const items: { key: string; label: string; icon?: any; danger?: boolean }[] = [
    canManage.value
      ? { key: 'account', label: '管理后台', icon: Settings }
      : { key: 'account', label: '我的密钥', icon: KeyRound },
    { key: '__sep', label: '' },
    { key: 'theme', label: isDark.value ? '切换到亮色' : '切换到暗色', icon: isDark.value ? Sun : Moon },
    { key: 'logout', label: '退出登录', icon: LogOut, danger: true }
  ]
  return items
})
const onUserMenuSelect = (key: string) => {
  if (key === 'account') navigateTo('/admin')
  else if (key === 'theme') toggleTheme()
  else if (key === 'logout') logout()
}
// E3：原生 prompt/alert 全部下线，改走应用内对话框与 Toast
const folderOpen = ref(false)
const folderParent = ref('')
const newNoteOpen = ref(false)
const newNoteTitle = ref('')
const newNoteParent = ref('')
const newNoteSubmitting = ref(false)
const toast = useToast()

// 跨页面「请求新建笔记」的唯一通道随知识图谱页一起下线：那个通道原本只有图谱页的命令
// （新建后回到 /graph?focus=）在用，如今没有发出方，留着只会是死代码 + 一个永远为 'note' 的分支。

// 侧栏开关与宽度（跨页面保留）
const SIDEBAR_KEY = 'garden-sidebar-width'
const SIDEBAR_MIN = 240
const SIDEBAR_MAX = 440
const SIDEBAR_DEFAULT = 320
const sidebarOpen = useState<boolean>('shell-sidebar-open', () => true)

/**
 * 宽度只允许是 [240, 440] 的整数。
 *
 * 侧栏宽度直接写进 `--sidebar-w`，一旦是 `NaN`，`width: var(--sidebar-w)` 在计算值阶段
 * 非法 → 回退 `auto`，侧栏被内容撑成一个和默认值无关的宽度（实测脏值 'abc' 得到 248px、
 * 空值 320px、'1280' 被夹到 440px）。localStorage 是用户能写坏的地方（旧版本遗留、
 * 手改、同步工具回放），所以读取和写入两侧都必须过这个夹子。
 */
const clampWidth = (n: number) => {
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(n)))
}
const sidebarWidth = useState<number>('shell-sidebar-width', () => SIDEBAR_DEFAULT)
const resizing = ref(false)
let dragLeft = 0
let resizeHandle: HTMLElement | null = null

/** 结束拖拽：无论正常松手、指针被系统取消、还是窗口失焦，都必须走到这里 */
const finishResize = () => {
  if (!resizing.value) return
  resizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (resizeHandle) {
    try { resizeHandle.style.removeProperty('touch-action') } catch { /* 元素已卸载 */ }
    resizeHandle = null
  }
  try { localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth.value)) } catch { /* 隐私模式禁写 */ }
}

const onResizeMove = (e: PointerEvent) => {
  if (!resizing.value) return
  sidebarWidth.value = clampWidth(e.clientX - dragLeft)
}

const startResize = (e: PointerEvent) => {
  e.preventDefault()
  resizing.value = true
  resizeHandle = (e.currentTarget as HTMLElement) || null
  // 捕获指针：拖到窗口外、拖到另一个窗口、或被系统打断时，pointerup/pointercancel
  // 仍然回到手柄上。没有捕获时这些情况收不到 pointerup，`resizing` 会永久为 true，
  // 之后鼠标在页面上一动侧栏就跟着变宽（直到 440 上限），body 的 user-select:none
  // 也一直撤不掉 —— 现象就是「打开网站时侧栏比默认的宽、而且点不动」。
  try { resizeHandle?.setPointerCapture(e.pointerId) } catch { /* 老浏览器忽略 */ }
  document.body.style.cursor = 'col-resize'
  // 拖拽期间禁用文本选择：否则手柄拖过正文/树行会拖蓝一片文字
  document.body.style.userSelect = 'none'
  // 以侧栏左边缘为基准换算宽度（左侧还有 60px 图标栏，不能直接用视口坐标）
  const host = resizeHandle?.parentElement
  dragLeft = host?.getBoundingClientRect().left ?? 0
}

// 进入窄屏（<1024）自动收起侧栏 —— 沿用 E4 行为；断点值来自 useViewport 单源。
// immediate: true 覆盖「首帧即为窄屏」的情形（isNarrow 在挂载后才校正为真）。
// 反向也要还回来：从窄屏拖回宽屏时，若不恢复，侧栏容器宽度是 0 且拖拽手柄被
// v-if="sidebarOpen" 隐藏，桌面布局里就再也拖不出侧栏（只能靠图标栏那个开关）。
let autoClosedDrawer = false
watch(isNarrow, (v) => {
  if (v) {
    autoClosedDrawer = sidebarOpen.value
    sidebarOpen.value = false
  } else if (autoClosedDrawer) {
    autoClosedDrawer = false
    sidebarOpen.value = true
  }
}, { immediate: true })
// 用户自己开一次侧栏，就不再自动关/自动开（避免和手动操作打架）
watch(sidebarOpen, (v) => { if (v) autoClosedDrawer = false })

const onKeydown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    commandOpen.value = !commandOpen.value
  }
  if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
    e.preventDefault()
    sidebarOpen.value = !sidebarOpen.value
  }
  if (e.key === 'Escape') {
    if (commandOpen.value) commandOpen.value = false
    if (createMenuOpen.value) createMenuOpen.value = false
    if (fabMenuOpen.value) fabMenuOpen.value = false
    if (isNarrow.value && sidebarOpen.value) sidebarOpen.value = false
  }
}

onMounted(() => {
  headerActionsReady.value = true
  // 记住的宽度在挂载后才生效：SSR 首帧用默认值，随后按 localStorage 校正。
  // 只有「合法区间内的整数」才认；NaN / 'abc' / 1280 / 640 这类脏值一律丢弃并清键，
  // 回到默认 320 —— 它们要么让 `--sidebar-w: NaNpx` 失效（宽度由内容撑开），
  // 要么被夹到 440 上限，两种都表现为「打开网站时侧栏比默认的宽」，且会一直跟着刷新走。
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved != null && saved !== '') {
      const raw = Number(saved)
      if (Number.isFinite(raw) && raw >= SIDEBAR_MIN && raw <= SIDEBAR_MAX) {
        sidebarWidth.value = Math.round(raw)
      } else {
        sidebarWidth.value = SIDEBAR_DEFAULT
        localStorage.removeItem(SIDEBAR_KEY)
      }
    }
  } catch { /* 隐私模式禁读 */ }

  window.addEventListener('pointermove', onResizeMove, { passive: true })
  // pointerup / pointercancel / 窗口失焦 三条路径都收尾：少任何一条，拖拽状态都会卡住
  window.addEventListener('pointerup', finishResize)
  window.addEventListener('pointercancel', finishResize)
  window.addEventListener('blur', finishResize)
  document.addEventListener('visibilitychange', finishResize)

  // 全局快捷键：⌘K 命令面板 · ⌘\ 收起/展开侧栏 · ESC 关闭浮层
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('click', closeCreateMenu)
})

// 布局组件理论上不会卸载（切页面只换 NuxtPage），但全局监听必须成对回收：
// 热更新、错误重挂载、将来的多布局切换都会走这里，漏一次就多一份幽灵监听到 body 上。
onBeforeUnmount(() => {
  finishResize()
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', finishResize)
  window.removeEventListener('pointercancel', finishResize)
  window.removeEventListener('blur', finishResize)
  document.removeEventListener('visibilitychange', finishResize)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('click', closeCreateMenu)
})

const { tree, treePending, treeError, reloadTree, tags, totalNotes, sections, tagGroups, stats } = useFacets()
// tags / overview 由 useFacets 统一取数（sidebar-tags / overview 缓存键），此处不再单独请求
void tags

const route = useRoute()
const currentSlug = computed(() => decodeURIComponent(route.path.replace(/^\/notes\//, '')))

// FAB 的启用页面：交付物 §5 ②「仅首页 / 列表启用；详情与编辑态不显示」。
// 分类浏览页（/browse）同样启用：它就是一个列表页，用户在那里新建笔记的心理预期与 /notes 一致。
const FAB_ROUTES = new Set(['/', '/notes', '/browse'])
const showFab = computed(() => canManage.value && FAB_ROUTES.has(route.path))

// 面包屑：Garden Vault / …路径段（末段高亮）
/** 路由段 → 面包屑文案（slug 段保持原样，只有固定页面需要翻译） */
const SEG_LABEL: Record<string, string> = { notes: '笔记', browse: '分类浏览', admin: '管理后台' }

const crumbs = computed(() => {
  const segs = route.path.split('/').filter(Boolean).map(s => decodeURIComponent(s))
  return ['Garden Vault', ...segs.map(s => SEG_LABEL[s] ?? s)]
})

const activeTag = computed(() => (typeof route.query.tag === 'string' ? route.query.tag : ''))
const activeDir = computed(() => (typeof route.query.dir === 'string' ? route.query.dir : ''))

const startCreateRoot = () => {
  createMenuOpen.value = false
  newNoteTitle.value = ''
  newNoteOpen.value = true
}

/** 新建/打开的统一实现（含「等入库可读再跳转」的兜底），与结构树内联新建共用一份。 */
const { createNote, openNote } = useCreateNote()

const submitCreateRoot = async () => {
  const title = newNoteTitle.value.trim()
  if (!title) return
  newNoteSubmitting.value = true
  try {
    const slug = await createNote(newNoteParent.value, title)
    newNoteOpen.value = false
    toast.success(`已创建「${title}」`)
    // 服务端已在 POST 返回前主动入库，这里再兜一层等待（覆盖 watcher 兜底路径与慢盘），
    // 否则客户端路由会被 404 中止：地址栏是新笔记、内容却停在列表页且不会恢复。
    await openNote(slug)
  } catch (e: any) {
    toast.error(e?.data?.message || '创建失败')
  } finally {
    newNoteSubmitting.value = false
  }
}

// parent 只接受字符串。注意：模板里若写成 `@click="startCreateFolder"`，Vue 会把 MouseEvent
// 当第一个参数传进来 → 状态被污染成 Event 对象 → 对话框 preview 里 .split() 抛错、组件渲染崩溃，
// 而 folderOpen 又已置为 true，后续点击赋值无变化 → 所有「新建文件夹」入口全部无反应。
const startCreateFolder = (parent: unknown = '') => {
  createMenuOpen.value = false
  folderParent.value = typeof parent === 'string' ? parent : ''
  folderOpen.value = true
}

const startCreateNoteIn = (parent: unknown = '') => {
  newNoteTitle.value = ''
  newNoteParent.value = typeof parent === 'string' ? parent : ''
  newNoteOpen.value = true
}

const startImport = () => {
  createMenuOpen.value = false
  openImportDialog('')
}

const closeCreateMenu = (e: MouseEvent) => {
  const el = e.target as HTMLElement
  // FAB 弹出层内部点击不关闭（其容器同样标注了 data-create-menu）
  if (el.closest?.('[data-create-menu]')) return
  createMenuOpen.value = false
  fabMenuOpen.value = false
}

// FAB 的三项动作：先收起弹出层，再复用与顶栏下拉完全相同的处理函数（单一实现，不复制逻辑）
const onFabMenu = (kind: 'note' | 'folder' | 'import') => {
  fabMenuOpen.value = false
  if (kind === 'note') startCreateRoot()
  else if (kind === 'folder') startCreateFolder()
  else startImport()
}

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <div
    class="h-screen w-screen overflow-hidden bg-canvas text-ink flex"
    :style="{ '--sidebar-w': sidebarWidth + 'px' }"
  >
    <!-- 图标栏（spec 断点表：≥1024 显示；640–1023 与手机隐藏，改为抽屉 + 底部 TabBar） -->
    <div class="hidden lg:block h-full">
      <RailNav :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" @logout="logout" />
    </div>

    <!-- 主列：顶栏 + 主体 + 底部导航（手机） -->
    <div class="flex-1 min-w-0 h-full flex flex-col">
      <!-- 顶栏 60px（吸顶：位于 flex 列首、内容区独立滚动，因此结构上永不跟随滚动）
           交付物 §5 ①：手机端滚动位移 > 8px 时底边 1px 分隔线渐显，回到顶部淡出。
           仅手机生效 —— 桌面/平板的常驻分隔线是 E4 已验收的形态，不动。 -->
      <header
        class="shrink-0 flex items-center gap-3 px-4 border-b bg-surface/90 backdrop-blur z-30 select-none transition-colors duration-base"
        :class="isPhone && !scrolled ? 'border-transparent' : 'border-line'"
        :style="{ height: 'var(--header-h)' }"
      >
        <!-- 抽屉开关（<1024：图标栏隐藏，侧栏转为抽屉 + 遮罩） -->
        <button
          class="lg:hidden w-[38px] h-[38px] rounded-ctl flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro shrink-0"
          title="打开侧栏"
          aria-label="打开侧栏"
          :aria-expanded="sidebarOpen"
          @click="sidebarOpen = !sidebarOpen"
        >
          <MenuIcon class="w-4 h-4" />
        </button>

        <!-- 面包屑（<640 收敛为末段标题） -->
        <nav class="flex-1 min-w-0 flex items-center gap-1 text-ds-sm text-ink-3" aria-label="面包屑">
          <template v-for="(c, i) in crumbs" :key="i">
            <span v-if="i > 0" class="text-ink-3/60 hidden sm:inline">/</span>
            <span
              class="truncate"
              :class="i === crumbs.length - 1
                ? 'text-ink font-semibold'
                : 'hidden sm:inline sm:max-w-[16ch] lg:max-w-none'"
            >{{ c }}</span>
          </template>
        </nav>

        <!-- 搜索触发（⌘K）：≥640 完整输入框，<640 收敛为图标按钮 -->
        <button
          class="hidden sm:flex items-center gap-2 bg-surface-2 hover:bg-surface-3 border border-line hover:border-ink-3 px-3 py-1.5 rounded-full text-ink-3 text-ds-sm transition-colors duration-micro w-64 shrink-0"
          @click="commandOpen = true"
        >
          <Search class="w-3.5 h-3.5" />
          <span class="flex-1 text-left">搜索笔记、标签、想法…</span>
          <kbd class="text-xs font-mono bg-surface px-1.5 py-0.5 rounded border border-line">⌘K</kbd>
        </button>
        <button
          class="sm:hidden w-[38px] h-[38px] rounded-ctl flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro shrink-0"
          title="搜索（⌘K）"
          aria-label="搜索"
          @click="commandOpen = true"
        >
          <Search class="w-4 h-4" />
        </button>

        <!-- 页面级顶栏动作插槽（交付物第 04 / 19 屏）：详情页在此注入「目录 / 更多」。
             只在手机端占位 —— 桌面端详情页沿用页内的操作行，位置不动。 -->
        <div
          id="shell-header-actions"
          data-header-actions
          class="sm:hidden flex items-center gap-1 shrink-0 empty:hidden"
        ></div>

        <!-- 新建下拉：新建笔记 / 新建文件夹 / 导入笔记（spec 9）
             手机端与 FAB 并存且共用同一套动作 —— FAB 滚动隐藏后此处不留死路。 -->
        <div v-if="canManage" class="relative shrink-0" data-create-menu>
          <button
            class="flex items-center gap-1.5 px-3 h-[38px] rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] shadow-ds1 transition-transform duration-micro active:scale-95"
            title="新建"
            aria-haspopup="menu"
            :aria-expanded="createMenuOpen"
            @click="createMenuOpen = !createMenuOpen"
          >
            <Plus class="w-3.5 h-3.5" /><span class="hidden sm:inline">新建</span>
            <ChevronDown class="w-3 h-3 transition-transform duration-micro" :class="createMenuOpen ? 'rotate-180' : ''" />
          </button>
          <div
            v-if="createMenuOpen"
            class="absolute right-0 mt-2 w-44 rounded-card bg-surface border border-line shadow-ds3 p-1 z-50"
            role="menu"
          >
            <CreateMenuItems @note="startCreateRoot" @folder="startCreateFolder()" @import="startImport" />
          </div>
        </div>

        <!-- 用户菜单（<1024）：承载管理后台 / 我的密钥、主题切换与退出登录 -->
        <Menu
          v-model:open="userMenuOpen"
          :items="userMenuItems"
          class="lg:hidden shrink-0"
          @select="onUserMenuSelect"
        >
          <template #trigger>
            <button
              class="w-[38px] h-[38px] rounded-ctl flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
              :title="`${roleLabel}${me?.label ? ' · ' + me.label : ''}`"
              aria-label="账户菜单"
              :aria-expanded="userMenuOpen"
            >
              <UserRound class="w-4 h-4" />
            </button>
          </template>
        </Menu>
      </header>

      <!-- 主体 -->
      <div class="flex-1 min-h-0 flex relative">
        <!-- 侧栏（≥1024 常驻；<1024 抽屉）
             抽屉宽度按交付物 §5 ④ 的公式：min(320, max(300, 屏宽 × 0.82))
             —— 取代此前写死的 286px（小屏会显得局促、大屏平板浪费空间）。 -->
        <div
          class="h-full shrink-0 relative overflow-hidden transition-[width] duration-drawer ease-dawn"
          :class="isNarrow
            ? 'absolute left-0 top-0 z-40 shadow-ds3'
            : ''"
          :style="{ width: isNarrow ? (sidebarOpen ? drawerW + 'px' : '0px') : (sidebarOpen ? 'var(--sidebar-w, 320px)' : '0px') }"
        >
          <!-- overflow-hidden：树行/标签 chip 一旦比栏宽更宽（超长标题、连续英文），
               会在侧栏外沿「漏」出去压住正文，正文那片区域点到的其实是侧栏里的元素 -->
          <div v-show="sidebarOpen" class="h-full overflow-hidden" :style="{ width: isNarrow ? drawerW + 'px' : 'var(--sidebar-w, 320px)' }">
            <ContextSidebar
              :tree="(tree as any)?.tree || []"
              :sections="sections"
              :tag-groups="tagGroups"
              :stats="stats"
              :total-notes="totalNotes"
              :can-manage="canManage"
              :active-tag="activeTag"
              :active-dir="activeDir"
              :current-slug="currentSlug"
              :tree-pending="treePending"
              :tree-error="!!treeError"
              @reload-tree="reloadTree"
              @start-resize="startResize"
              @import="startImport"
              @new-folder="startCreateFolder"
              @new-note="startCreateNoteIn"
            />
          </div>
        </div>

        <!-- 抽屉遮罩（<1024） -->
        <div
          v-if="isNarrow && sidebarOpen"
          class="absolute inset-0 z-30 bg-[rgba(10,13,19,0.45)]"
          @click="sidebarOpen = false"
        ></div>

        <!-- 拖拽手柄（≥1024） -->
        <div
          v-if="sidebarOpen && !isNarrow"
          data-sidebar-resize
          class="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[var(--accent-soft)] transition-colors"
          style="touch-action: none"
          title="拖动调整宽度"
          @pointerdown="startResize"
        ></div>
        <!-- 内容区 -->
        <main ref="scrollEl" data-scroll-root class="flex-1 min-w-0 h-full overflow-y-auto">
          <NuxtPage />
        </main>

        <!-- 新建 FAB（手机）：拇指可达的主入口，仅首页 / 列表页；滚动隐藏见 AppFab 内注 -->
        <AppFab
          v-if="showFab"
          v-model:open="fabMenuOpen"
          :hidden="fabHidden"
          @note="onFabMenu('note')"
          @folder="onFabMenu('folder')"
          @import="onFabMenu('import')"
        />
      </div>

      <!-- 底部主导航（手机 <640；编辑态让位给编辑器操作条） -->
      <BottomTabBar v-if="!editorOpen" />
    </div>

    <!-- 全局浮层：命令面板 / 批量导入 / 新建文件夹 / 新建笔记 / Toast / 确认框
         一律只在客户端渲染 —— 这些组件内部都是 `Teleport to body`：SSR 会把内容输出到
         body 末尾，客户端 hydration 再按自己的顺序去匹配，多个 Teleport 之间必然错位，
         实测 ImportDialog 与 ToastHost 在**每个页面**都报
         「Hydration node mismatch（server: HTMLDivElement / client: Comment）」，
         进而让 Vue 丢弃整块 SSR DOM 重新渲染 —— 这正是用户反馈的「切换页面闪烁」。
         它们只由交互触发、无需 SSR，包一层 ClientOnly 即可彻底消除该错配。 -->
    <ClientOnly>
      <!-- ⌘K 命令面板 -->
      <CommandPalette v-model:open="commandOpen" />

      <!-- 列表行长按操作面板（交付物第 22 屏）：挂在根部，任意页面触发即可弹出 -->
      <NoteActionSheet />

      <!-- 标签 · 领域审核面板：由管理后台或笔记操作面板唤起（状态在 useSuggestionReview） -->
      <SuggestionReviewDialog
        :open="suggestReviewOpen"
        :only-ids="suggestReviewOnlyIds"
        @update:open="(v: boolean) => suggestReviewOpen = v"
        @applied="onSuggestApplied"
      />

      <!-- 批量导入对话框 -->
      <ImportDialog />

      <!-- 新建文件夹（spec 6 NewFolderDialog）：替代原生 prompt -->
      <NewFolderDialog v-model:open="folderOpen" :tree="(tree as any)?.tree || []" :default-parent="folderParent" />

      <!-- 新建笔记（替代原生 prompt） -->
      <AppDialog v-model:open="newNoteOpen" title="新建笔记" size="sm">
        <label class="block">
          <span class="block text-[12px] text-ink-3 mb-1.5">笔记标题</span>
          <input
            v-model="newNoteTitle"
            placeholder="如：Rust 所有权模型"
            class="w-full px-3 py-2 rounded-ctl bg-surface-2 border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
            @keyup.enter="submitCreateRoot"
          />
          <span class="block mt-2 text-[12px] text-ink-3 font-mono break-all">
            落点：Garden Vault{{ newNoteParent ? ' / ' + newNoteParent.split('/').join(' / ') : '' }} / {{ newNoteTitle.trim() || '（标题）' }}.md
          </span>
        </label>
        <template #footer>
          <button
            class="px-3.5 py-2 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
            @click="newNoteOpen = false"
          >取消</button>
          <button
            class="px-3.5 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] transition-opacity duration-micro disabled:opacity-45"
            :disabled="!newNoteTitle.trim() || newNoteSubmitting"
            @click="submitCreateRoot"
          >{{ newNoteSubmitting ? '创建中…' : '创建并打开' }}</button>
        </template>
      </AppDialog>

      <!-- 全局浮层：Toast（aria-live）与确认对话框 -->
      <ToastHost />
      <ConfirmHost />
    </ClientOnly>

    <!-- 关闭抽屉的悬浮按钮：仅平板（640–1023）显示。
         手机端已有底部 TabBar 占据右下角，且抽屉可由顶栏汉堡或遮罩关闭 —— 此处必须让位，
         否则会与 FAB 叠在同一位置。 -->
    <button
      v-if="isNarrow && sidebarOpen"
      class="hidden sm:flex lg:hidden fixed bottom-4 right-4 z-50 w-[38px] h-[38px] rounded-full bg-surface border border-line shadow-ds2 items-center justify-center text-ink-2"
      title="关闭侧栏"
      @click="sidebarOpen = false"
    >
      <X class="w-4 h-4" />
    </button>
  </div>
</template>
