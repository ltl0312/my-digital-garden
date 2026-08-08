<script setup lang="ts">
import { Sprout, Search, BookOpen, Share2, Settings, Sun, Moon, PanelLeft, Filter } from 'lucide-vue-next'

const { isDark, toggleTheme } = useTheme()
const { isAdmin } = useAuth()
const sidebarOpen = ref(true)
const commandOpen = ref(false)
const treeQuery = ref('')

const SIDEBAR_KEY = 'garden-sidebar-width'
const sidebarWidth = ref(320)
const resizing = ref(false)
let dragOffset = 0

const startResize = (e: PointerEvent) => {
  resizing.value = true
  document.body.style.cursor = 'col-resize'
  // 记录鼠标点击位置与当前宽度的差值（消除 aside 左侧布局偏移，如 mx-auto 容器居中留白）
  dragOffset = e.clientX - sidebarWidth.value
}

onMounted(() => {
  const saved = localStorage.getItem(SIDEBAR_KEY)
  if (saved) sidebarWidth.value = Math.min(480, Math.max(240, Number(saved)))
  window.addEventListener('pointermove', (e) => {
    if (!resizing.value) return
    sidebarWidth.value = Math.min(480, Math.max(240, e.clientX - dragOffset))
  })
  window.addEventListener('pointerup', () => {
    if (resizing.value) {
      resizing.value = false
      document.body.style.cursor = ''
      localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth.value))
    }
  })
  // 全局 ⌘K / ⌃K 快捷键
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      commandOpen.value = !commandOpen.value
    }
    if (e.key === 'Escape' && commandOpen.value) {
      commandOpen.value = false
    }
  })
})

const requestFetch = useRequestFetch()
const { data: tree } = await useAsyncData('vault-tree', () => requestFetch('/api/vault/tree'))
const { data: tags } = await useAsyncData('sidebar-tags', () => requestFetch('/api/tags'))

// 文件树过滤：按搜索词过滤，目录递归保留（仅当子节点有匹配时）
const filteredTree = computed(() => {
  const q = treeQuery.value.trim().toLowerCase()
  const walk = (nodes: any[]): any[] => {
    const out: any[] = []
    for (const n of nodes) {
      if (n.type === 'dir') {
        const children = walk(n.children || [])
        if (children.length) out.push({ ...n, children })
      } else if (!q || n.name.toLowerCase().includes(q) || (n.slug || '').toLowerCase().includes(q)) {
        out.push(n)
      }
    }
    return out
  }
  return walk(tree.value?.tree || [])
})

// 笔记总数（树递归计数）
const noteCount = computed(() => {
  let count = 0
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if (n.type === 'file') count++
      else walk(n.children || [])
    }
  }
  walk(tree.value?.tree || [])
  return count
})

const startCreateRoot = () => {
  const title = prompt('新建笔记标题：')
  if (!title?.trim()) return
  $fetch('/api/vault/notes', { method: 'POST', body: { path: '', title: title.trim() } })
    .then(({ slug }: any) => navigateTo(`/notes/${slug.split('/').map(encodeURIComponent).join('/')}`))
    .catch((e: any) => alert(e?.data?.message || '创建失败'))
}

const logout = async () => {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <div class="bg-mesh min-h-screen font-sans antialiased text-slate-800 dark:text-slate-200 transition-colors duration-300">
    <!-- 顶栏 -->
    <header class="glass-header h-16 px-5 flex items-center justify-between z-30 shrink-0 select-none sticky top-0">
      <NuxtLink to="/" class="flex items-center space-x-3 group">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-garden-400 to-emerald-600 dark:from-garden-400 dark:to-emerald-700 flex items-center justify-center text-slate-950 shadow-lg shadow-garden-500/20 group-hover:scale-105 transition-transform duration-300">
          <Sprout class="w-5 h-5" :stroke-width="2.5" />
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-lg tracking-tight text-slate-900 dark:text-white group-hover:text-garden-600 dark:group-hover:text-garden-400 transition-colors">拾光</span>
            <span class="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-garden-500/10 text-garden-700 dark:text-garden-400 border border-garden-500/20 font-semibold">Garden</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 -mt-0.5 font-light">Non-linear Knowledge Sanctuary</p>
        </div>
      </NuxtLink>

      <!-- 搜索栏（⌘K） -->
      <button
        class="hidden md:flex items-center cursor-pointer bg-slate-100/80 hover:bg-slate-200/80 dark:bg-obsidian-800/80 dark:hover:bg-obsidian-700/80 border border-slate-200 dark:border-white/10 hover:border-garden-500/40 px-4 py-2 rounded-full w-80 text-slate-500 dark:text-slate-400 text-sm transition-all duration-200 shadow-inner group"
        @click="commandOpen = true"
      >
        <Search class="w-4 h-4 mr-2.5 text-slate-400 group-hover:text-garden-600 dark:group-hover:text-garden-400 transition-colors" />
        <span class="flex-1 font-light text-left">Search notes, tags, ideas...</span>
        <kbd class="text-[11px] font-mono bg-white dark:bg-obsidian-900/80 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 shadow-sm">⌘K</kbd>
      </button>

      <!-- 右侧操作区 -->
      <div class="flex items-center space-x-2">
        <div class="bg-slate-200/70 dark:bg-obsidian-800/90 border border-slate-300/60 dark:border-white/10 p-1 rounded-xl flex items-center space-x-1 shadow-sm">
          <NuxtLink to="/notes" class="px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5">
            <BookOpen class="w-3.5 h-3.5" /><span class="hidden sm:inline">Notes</span>
          </NuxtLink>
          <NuxtLink to="/graph" class="px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5">
            <Share2 class="w-3.5 h-3.5" /><span class="hidden sm:inline">Graph</span>
          </NuxtLink>
          <NuxtLink v-if="isAdmin" to="/admin" class="px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 transition-all duration-200 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5">
            <Settings class="w-3.5 h-3.5" /><span class="hidden sm:inline">Admin</span>
          </NuxtLink>
        </div>
        <div class="h-5 w-[1px] bg-slate-300 dark:bg-white/10 mx-1"></div>
        <button
          class="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-garden-500/50 transition-all duration-200 active:scale-95"
          title="Toggle Garden Theme"
          @click="toggleTheme"
        >
          <Sun v-if="isDark" class="w-4 h-4 text-garden-600 dark:text-garden-400" />
          <Moon v-else class="w-4 h-4 text-garden-600 dark:text-garden-400" />
        </button>
        <button
          class="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-garden-500/50 transition-all duration-200 active:scale-95"
          title="Toggle Sidebar"
          @click="sidebarOpen = !sidebarOpen"
        >
          <PanelLeft class="w-4 h-4" />
        </button>
        <button class="text-xs text-slate-500 dark:text-slate-400 hover:text-garden-600 dark:hover:text-garden-400 transition-colors" title="退出登录" @click="logout">Logout</button>
      </div>
    </header>

    <!-- 主体：全宽 flex，aside 贴视口左缘 -->
    <div class="flex">
      <!-- 侧边栏：始终挂载，宽度过渡实现平滑收起/展开 -->
      <aside
        :style="{
          width: sidebarOpen ? sidebarWidth + 'px' : '0px',
          transition: resizing ? 'none' : 'width 0.3s ease'
        }"
        class="glass-card border-y-0 border-l-0 z-20 flex flex-col shrink-0 overflow-hidden max-h-[calc(100vh-4rem)] sticky top-16"
      >
        <!-- 搜索过滤 + Stage pills -->
        <div class="p-4 border-b border-slate-200/80 dark:border-white/10 space-y-3">
          <div class="relative">
            <input
              v-model="treeQuery"
              type="text"
              placeholder="Filter notes..."
              class="w-full bg-slate-100/90 dark:bg-obsidian-900/90 border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2 pl-9 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-garden-500/60 focus:ring-1 focus:ring-garden-500/30 transition-all"
            />
            <Filter class="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <button v-if="treeQuery" class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs" @click="treeQuery = ''">✕</button>
          </div>
        </div>

        <!-- 文件树 + 标签云 -->
        <div class="flex-1 overflow-y-auto p-3">
          <div class="flex items-center justify-between px-2 pb-2">
            <span class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">Vault</span>
            <button v-if="isAdmin" class="text-[10px] text-garden-600 dark:text-garden-400 hover:text-garden-700 dark:hover:text-garden-300" @click="startCreateRoot">＋ New Note</button>
          </div>
          <FileTree v-if="tree" :nodes="filteredTree" :can-create="isAdmin" />
          <div class="pt-4 border-t border-slate-200/80 dark:border-white/10 mt-4">
            <span class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold block px-2 mb-2">Garden Tags</span>
            <div class="flex flex-wrap gap-1.5 px-1">
              <NuxtLink
                v-for="t in tags?.slice(0, 20)"
                :key="t.name"
                :to="`/notes?tag=${encodeURIComponent(t.name)}`"
                class="text-[11px] px-2.5 py-1 rounded-md cursor-pointer transition-all flex items-center space-x-1 bg-slate-200/60 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-slate-200"
              >
                <span>#{{ t.name }}</span><span class="text-[9px] opacity-60">({{ t.count }})</span>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- 状态栏 -->
        <div class="p-3 border-t border-slate-200 dark:border-white/10 text-xs text-slate-500 flex items-center justify-between bg-slate-100/60 dark:bg-obsidian-900/50">
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-garden-500 animate-pulse"></span>
            <span class="font-medium text-slate-600 dark:text-slate-400">Vault Synced</span>
          </div>
          <span class="font-mono text-[10px] text-slate-400">{{ noteCount }} Notes</span>
        </div>
      </aside>

      <!-- 拖拽手柄 -->
      <div
        v-if="sidebarOpen"
        class="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-garden-500/40 transition-colors"
        title="拖动调整宽度"
        @pointerdown="startResize"
      ></div>

      <!-- 内容区 -->
      <main class="flex-1 min-w-0">
        <NuxtPage />
      </main>
    </div>

    <!-- ⌘K 命令面板 -->
    <CommandPalette v-model:open="commandOpen" />
  </div>
</template>
