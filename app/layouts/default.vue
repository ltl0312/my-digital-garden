<script setup lang="ts">
import { Search, Plus, FilePlus, FolderPlus, Upload, ChevronDown, Menu as MenuIcon, Sun, Moon, X, Settings, KeyRound, LogOut, UserRound } from 'lucide-vue-next'

// AppShell（spec ch.4/6）：图标栏 60px + 顶栏 60px + 主体（上下文侧栏 + 内容区）
// 高度锁 100%，各区域内部滚动；<1024px 侧栏转为抽屉 + 遮罩，<768px 图标栏收进顶栏。
// 取数逻辑与持久化行为均沿用原实现（同一接口、同一 localStorage 键）。
const { isDark, toggleTheme } = useTheme()
const { me } = useAuth()
const { openDialog: openImportDialog } = useImportDialog()
const { canManage, actorRole } = useRoles()

const commandOpen = useState<boolean>('shell-command-open', () => false)
const createMenuOpen = ref(false)
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

// 侧栏开关与宽度（跨页面保留）
const SIDEBAR_KEY = 'garden-sidebar-width'
const sidebarOpen = useState<boolean>('shell-sidebar-open', () => true)
const sidebarWidth = useState<number>('shell-sidebar-width', () => 320)
const resizing = ref(false)
let dragLeft = 0

const startResize = (e: PointerEvent) => {
  resizing.value = true
  document.body.style.cursor = 'col-resize'
  // 拖拽期间禁用文本选择：否则手柄拖过正文/树行会拖蓝一片文字
  document.body.style.userSelect = 'none'
  // 以侧栏左边缘为基准换算宽度（左侧还有 60px 图标栏，不能直接用视口坐标）
  const host = (e.currentTarget as HTMLElement)?.parentElement
  dragLeft = host?.getBoundingClientRect().left ?? 0
}

const isNarrow = ref(false)

onMounted(() => {
  const saved = localStorage.getItem(SIDEBAR_KEY)
  if (saved) sidebarWidth.value = Math.min(440, Math.max(240, Number(saved)))
  const sync = () => {
    isNarrow.value = window.innerWidth < 1024
    if (isNarrow.value) sidebarOpen.value = false
  }
  sync()
  window.addEventListener('resize', sync)

  window.addEventListener('pointermove', (e) => {
    if (!resizing.value) return
    sidebarWidth.value = Math.min(440, Math.max(240, e.clientX - dragLeft))
  })
  window.addEventListener('pointerup', () => {
    if (resizing.value) {
      resizing.value = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth.value))
    }
  })

  // 全局快捷键：⌘K 命令面板 · ⌘\ 收起/展开侧栏 · ESC 关闭浮层
  window.addEventListener('keydown', (e) => {
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
      if (isNarrow.value && sidebarOpen.value) sidebarOpen.value = false
    }
  })
  window.addEventListener('click', closeCreateMenu)
})

const { tree, tags, graph, totalNotes, domains, tagGroups, stats } = useFacets()
// tags / graph 由 useFacets 统一取数（sidebar-tags / sidebar-graph 缓存键），此处不再单独请求
void tags
void graph

const route = useRoute()
const currentSlug = computed(() => decodeURIComponent(route.path.replace(/^\/notes\//, '')))

// 面包屑：Garden Vault / …路径段（末段高亮）
const crumbs = computed(() => {
  const segs = route.path.split('/').filter(Boolean).map(s => decodeURIComponent(s))
  return ['Garden Vault', ...segs]
})

const activeTag = computed(() => (typeof route.query.tag === 'string' ? route.query.tag : ''))
const activeDir = computed(() => (typeof route.query.dir === 'string' ? route.query.dir : ''))

const startCreateRoot = () => {
  createMenuOpen.value = false
  newNoteTitle.value = ''
  newNoteOpen.value = true
}

const submitCreateRoot = async () => {
  const title = newNoteTitle.value.trim()
  if (!title) return
  newNoteSubmitting.value = true
  try {
    const { slug } = await $fetch<{ slug: string }>('/api/vault/notes', { method: 'POST', body: { path: newNoteParent.value, title } })
    await refreshNuxtData('vault-tree')
    newNoteOpen.value = false
    toast.success(`已创建「${title}」`)
    await navigateTo(`/notes/${slug.split('/').map(encodeURIComponent).join('/')}`)
  } catch (e: any) {
    toast.error(e?.data?.message || '创建失败')
  } finally {
    newNoteSubmitting.value = false
  }
}

const startCreateFolder = (parent = '') => {
  createMenuOpen.value = false
  folderParent.value = parent
  folderOpen.value = true
}

const startCreateNoteIn = (parent = '') => {
  newNoteTitle.value = ''
  newNoteParent.value = parent
  newNoteOpen.value = true
}

const startImport = () => {
  createMenuOpen.value = false
  openImportDialog('')
}

const closeCreateMenu = (e: MouseEvent) => {
  const el = e.target as HTMLElement
  if (!el.closest?.('[data-create-menu]')) createMenuOpen.value = false
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
    <!-- 图标栏（spec 断点表：≥1024 显示；768–1023 与手机隐藏，侧栏转抽屉） -->
    <div class="hidden lg:block h-full">
      <RailNav :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" @logout="logout" />
    </div>

    <!-- 主列：顶栏 + 主体 -->
    <div class="flex-1 min-w-0 h-full flex flex-col">
      <!-- 顶栏 60px -->
      <header
        class="shrink-0 flex items-center gap-3 px-4 border-b border-line bg-surface/90 backdrop-blur z-30 select-none"
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

        <!-- 新建下拉：新建笔记 / 新建文件夹 / 导入笔记（spec 9） -->
        <div v-if="canManage" class="relative shrink-0" data-create-menu>
          <button
            class="flex items-center gap-1.5 px-3 h-[38px] rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] shadow-ds1 transition-transform duration-micro active:scale-95"
            title="新建"
            @click="createMenuOpen = !createMenuOpen"
          >
            <Plus class="w-3.5 h-3.5" /><span class="hidden sm:inline">新建</span>
            <ChevronDown class="w-3 h-3 transition-transform duration-micro" :class="createMenuOpen ? 'rotate-180' : ''" />
          </button>
          <div
            v-if="createMenuOpen"
            class="absolute right-0 mt-2 w-44 rounded-card bg-surface border border-line shadow-ds3 p-1 z-50"
          >
            <button class="w-full px-3 py-2 rounded-ctl text-ds-sm text-left flex items-center gap-2 text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors duration-micro" @click="startCreateRoot">
              <FilePlus class="w-3.5 h-3.5 text-accent" />新建笔记
            </button>
            <button class="w-full px-3 py-2 rounded-ctl text-ds-sm text-left flex items-center gap-2 text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors duration-micro" @click="startCreateFolder">
              <FolderPlus class="w-3.5 h-3.5 text-accent" />新建文件夹
            </button>
            <button class="w-full px-3 py-2 rounded-ctl text-ds-sm text-left flex items-center gap-2 text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors duration-micro" @click="startImport">
              <Upload class="w-3.5 h-3.5 text-accent" />导入笔记
            </button>
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
        <!-- 侧栏（≥1024 常驻；<1024 抽屉） -->
        <div
          class="h-full shrink-0 relative transition-[width] duration-drawer ease-dawn"
          :class="isNarrow
            ? 'absolute left-0 top-0 z-40 shadow-ds3'
            : ''"
          :style="{ width: isNarrow ? (sidebarOpen ? '286px' : '0px') : (sidebarOpen ? 'var(--sidebar-w)' : '0px') }"
        >
          <div v-show="sidebarOpen" class="h-full" :style="{ width: isNarrow ? '286px' : 'var(--sidebar-w)' }">
            <ContextSidebar
              :tree="(tree as any)?.tree || []"
              :domains="domains"
              :tag-groups="tagGroups"
              :stats="stats"
              :total-notes="totalNotes"
              :can-manage="canManage"
              :active-tag="activeTag"
              :active-dir="activeDir"
              :current-slug="currentSlug"
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
          class="absolute inset-0 z-30 bg-[rgba(10,13,19,0.45)] backdrop-blur-[2px]"
          @click="sidebarOpen = false"
        ></div>

        <!-- 拖拽手柄（≥1024） -->
        <div
          v-if="sidebarOpen && !isNarrow"
          data-sidebar-resize
          class="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[var(--accent-soft)] transition-colors"
          title="拖动调整宽度"
          @pointerdown="startResize"
        ></div>
        <!-- 内容区 -->
        <main data-scroll-root class="flex-1 min-w-0 h-full overflow-y-auto">
          <NuxtPage />
        </main>
      </div>
    </div>

    <!-- ⌘K 命令面板 -->
    <CommandPalette v-model:open="commandOpen" />

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

    <!-- 移动端关闭抽屉的悬浮按钮（≥1024 不显示） -->
    <button
      v-if="isNarrow && sidebarOpen"
      class="fixed bottom-4 right-4 z-50 w-[38px] h-[38px] rounded-full bg-surface border border-line shadow-ds2 flex items-center justify-center text-ink-2 lg:hidden"
      title="关闭侧栏"
      @click="sidebarOpen = false"
    >
      <X class="w-4 h-4" />
    </button>
  </div>
</template>
