<script setup lang="ts">
import { Sprout, Home, FileText, Share2, Settings, Sun, Moon, PanelLeft } from 'lucide-vue-next'

// RailNav（spec ch.4/6）：60px 图标栏 —— 品牌 / 首页 / 笔记 / 图谱 / 后台 / 主题 / 侧栏
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const { isAdmin } = useAuth()

defineProps<{ sidebarOpen: boolean }>()
const emit = defineEmits<{ (e: 'toggle-sidebar'): void; (e: 'logout'): void }>()

const items = computed(() => {
  const list = [
    { to: '/', icon: Home, label: '首页' },
    { to: '/notes', icon: FileText, label: '笔记', match: '/notes' },
    { to: '/graph', icon: Share2, label: '知识图谱' }
  ]
  if (isAdmin.value) list.push({ to: '/admin', icon: Settings, label: '管理后台' })
  return list
})

const isActive = (item: { to: string; match?: string }) => {
  const target = item.match || item.to
  return target === '/' ? route.path === '/' : route.path.startsWith(target)
}
</script>

<template>
  <nav
    class="shrink-0 h-full flex flex-col items-center gap-1 py-3 border-r border-line bg-surface z-40"
    :style="{ width: 'var(--rail-w)' }"
    aria-label="主导航"
  >
    <NuxtLink
      to="/"
      class="w-10 h-10 mb-2 rounded-xl flex items-center justify-center bg-accent text-[var(--accent-ink)] shadow-ds1 hover:scale-105 transition-transform duration-micro"
      title="拾光 · 数字花园"
    >
      <Sprout class="w-5 h-5" :stroke-width="2.5" />
    </NuxtLink>

    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-micro group"
      :class="isActive(item)
        ? 'bg-[var(--accent-soft)] text-accent'
        : 'text-ink-3 hover:text-ink hover:bg-surface-3'"
      :aria-current="isActive(item) ? 'page' : undefined"
      :title="item.label"
    >
      <!-- 当前项左侧 3px 指示条 -->
      <span
        v-if="isActive(item)"
        class="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r bg-accent"
      ></span>
      <component :is="item.icon" class="w-[18px] h-[18px]" />
      <span class="pointer-events-none absolute left-12 px-2 py-1 rounded-lg bg-surface border border-line shadow-ds2 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-micro z-50">
        {{ item.label }}
      </span>
    </NuxtLink>

    <div class="flex-1"></div>

    <button
      class="w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-micro"
      :class="sidebarOpen ? 'bg-[var(--accent-soft)] text-accent' : 'text-ink-3 hover:text-ink hover:bg-surface-3'"
      title="收起 / 展开侧栏（⌘\）"
      :aria-pressed="sidebarOpen"
      @click="emit('toggle-sidebar')"
    >
      <PanelLeft class="w-[18px] h-[18px]" />
    </button>

    <button
      class="w-10 h-10 rounded-xl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro"
      title="切换主题"
      @click="toggleTheme"
    >
      <Sun v-if="isDark" class="w-[18px] h-[18px]" />
      <Moon v-else class="w-[18px] h-[18px]" />
    </button>

    <button
      class="w-10 h-10 mt-1 rounded-xl flex items-center justify-center text-ink-3 hover:text-danger hover:bg-surface-3 transition-colors duration-micro"
      title="退出登录"
      @click="emit('logout')"
    >
      <span class="text-xs font-semibold">退</span>
    </button>
  </nav>
</template>
