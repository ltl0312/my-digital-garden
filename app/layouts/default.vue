<script setup lang="ts">
const { isDark, toggleTheme } = useTheme()
const { isAdmin } = useAuth()
const sidebarOpen = ref(true)

const SIDEBAR_KEY = 'garden-sidebar-width'
const sidebarWidth = ref(240)
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
  if (saved) sidebarWidth.value = Math.min(480, Math.max(180, Number(saved)))
  window.addEventListener('pointermove', (e) => {
    if (!resizing.value) return
    sidebarWidth.value = Math.min(480, Math.max(180, e.clientX - dragOffset))
  })
  window.addEventListener('pointerup', () => {
    if (resizing.value) {
      resizing.value = false
      document.body.style.cursor = ''
      localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth.value))
    }
  })
})

const requestFetch = useRequestFetch()
const { data: tree } = await useAsyncData('vault-tree', () => requestFetch('/api/vault/tree'))

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
  <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors">
    <header class="sticky top-0 z-50 bg-[var(--card-bg)] border-b border-[var(--border-color)] shadow-sm">
      <div class="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button
            class="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition"
            title="切换文件侧边栏"
            @click="sidebarOpen = !sidebarOpen"
          >☰</button>
          <NuxtLink to="/" class="font-semibold tracking-tight">
            ✨ 拾光
          </NuxtLink>
        </div>
        <nav class="flex items-center gap-4">
          <NuxtLink to="/notes" class="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition">
            全部笔记
          </NuxtLink>
          <NuxtLink to="/graph" class="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition">
            知识图谱
          </NuxtLink>
          <NuxtLink v-if="isAdmin" to="/admin" class="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition">
            管理后台
          </NuxtLink>
          <button
            class="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition"
            @click="logout"
          >退出</button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition"
            @click="toggleTheme"
          >
            {{ isDark ? '☀️ 浅色' : '🌙 暗色' }}
          </button>
        </nav>
      </div>
    </header>
    <div class="flex max-w-[1400px] mx-auto">
      <aside
        v-if="sidebarOpen"
        :style="{ width: sidebarWidth + 'px', transition: resizing ? 'none' : 'width 0.15s ease' }"
        class="shrink-0 border-r border-[var(--border-color)] p-3 overflow-y-auto max-h-[calc(100vh-3.5rem)] sticky top-14"
      >
        <div class="flex items-center justify-between mb-2 px-1.5">
          <span class="text-xs font-semibold text-[var(--text-secondary)]">文件</span>
          <button v-if="isAdmin" class="text-xs text-[var(--accent-color)]" title="在 vault 根新建笔记" @click="startCreateRoot">
            ＋ 新建
          </button>
        </div>
        <FileTree v-if="tree" :nodes="tree.tree" :can-create="isAdmin" />
      </aside>
      <div
        class="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[var(--accent-color)] transition-colors"
        title="拖动调整宽度"
        @pointerdown="startResize"
      ></div>
      <main class="flex-1 min-w-0">
        <NuxtPage />
      </main>
    </div>
  </div>
</template>
