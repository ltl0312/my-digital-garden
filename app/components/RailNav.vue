<script setup lang="ts">
import { Sprout, Sun, Moon, PanelLeft } from 'lucide-vue-next'

// RailNav（spec ch.4/6）：60px 图标栏 —— 品牌 / 主导航 / 侧栏开关 / 主题 / 退出
//
// 导航项来自 useNavItems 单源（与手机端底部 TabBar 共用同一份定义）。
// 这里顺带修掉一个既有缺陷：原先写成 `if (isAdmin) push('/admin')`，
// 但 spec 8.4 明确「我的密钥」**所有角色可见**（pages/admin.vue:185 起对全角色渲染身份卡），
// 于是普通用户在桌面端没有任何入口能进入自己的密钥。现在第四项恒在，
// 标签按 `canManage` 在「管理后台 / 我的密钥」之间切换（与顶栏用户菜单口径一致）。
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const items = useNavItems()

defineProps<{ sidebarOpen: boolean }>()
const emit = defineEmits<{ (e: 'toggle-sidebar'): void; (e: 'logout'): void }>()
</script>

<template>
  <nav
    class="shrink-0 h-full flex flex-col items-center gap-1 py-3 border-r border-line bg-surface z-40"
    :style="{ width: 'var(--rail-w)' }"
    aria-label="主导航"
  >
    <!-- shrink-0：图标栏是 flex 列，窗口高度偏矮时其余子项会被压缩；品牌图标（最上方）
         必须保持 40px 不参与压缩，否则会被挤成一条线，看起来像「图标消失了」 -->
    <NuxtLink
      to="/"
      class="w-10 h-10 mb-2 shrink-0 rounded-xl flex items-center justify-center bg-accent text-[var(--accent-ink)] shadow-ds1 hover:scale-105 transition-transform duration-micro"
      title="拾光 · 数字花园"
    >
      <Sprout class="w-5 h-5" :stroke-width="2.5" />
    </NuxtLink>

    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-micro group"
      :class="navItemActive(item, route.path)
        ? 'bg-[var(--accent-soft)] text-accent'
        : 'text-ink-3 hover:text-ink hover:bg-surface-3'"
      :aria-current="navItemActive(item, route.path) ? 'page' : undefined"
      :title="item.label"
    >
      <!-- 当前项左侧 3px 指示条 -->
      <span
        v-if="navItemActive(item, route.path)"
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
