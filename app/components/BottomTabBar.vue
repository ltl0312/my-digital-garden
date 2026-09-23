<script setup lang="ts">
// 底部 Pill TabBar（交付物第 02–08 屏）：**手机（<640）显示**，≥640 交回图标栏 / 抽屉。
//
// 显隐刻意用 CSS（`sm:hidden`）而非 JS 断点：
//   · SSR 输出与客户端首帧结构一致 → 无 hydration mismatch；
//   · 手机上不会出现「先渲染再消失」的首帧闪烁（useViewport 的 width 首帧恒为桌面）。
// 这里是全局结构，只要不满足「CSS 能表达」才考虑用 JS。
//
// 条目与图标栏同源（useNavItems），4 项 = 首页 / 笔记 / 知识图谱 / 管理后台（或「我的密钥」）。
// 每项都有 ≥44px 的触控高度（icon 18 + label 12 + 内边距），符合 spec 触控目标要求。
const route = useRoute()
const items = useNavItems()
</script>

<template>
  <nav
    class="sm:hidden shrink-0 bg-canvas px-[21px] pt-3"
    style="padding-bottom: calc(20px + env(safe-area-inset-bottom))"
    aria-label="主导航（底部）"
    data-testid="bottom-tabbar"
  >
    <div
      class="flex items-center p-1 rounded-[36px] border border-line bg-surface/90 backdrop-blur shadow-ds3"
    >
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex-1 h-[54px] flex flex-col items-center justify-center gap-1 rounded-[26px] transition-colors duration-micro"
        :class="navItemActive(item, route.path)
          ? 'bg-[var(--accent-soft)] text-accent'
          : 'text-ink-3'"
        :aria-current="navItemActive(item, route.path) ? 'page' : undefined"
        :title="item.label"
      >
        <component :is="item.icon" class="w-[18px] h-[18px] shrink-0" />
        <span class="text-xs leading-none">{{ item.short }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
