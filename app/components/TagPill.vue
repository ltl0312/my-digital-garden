<script setup lang="ts">
// 标签胶囊（spec 6 三件套）：统一高度与圆角；可选计数、可选跳转
const props = withDefaults(defineProps<{
  name: string
  count?: number
  /** 传 to 变成链接（列表页跳筛选）；未传但父级挂了 @click 时渲染为按钮；两者都没有则退化为纯文本 */
  to?: string
  active?: boolean
}>(), { active: false })

// 只有父级真的监听点击时才值得占用一个可聚焦、可误触的按钮位。
// 此前无 to、无 @click 时也渲染 <button>，列表页每行 3 个标签 = 每页 60 个点了没反应的按钮。
const attrs = useAttrs()
const clickable = computed(() => !!attrs.onClick)

const label = computed(() => props.name.includes('/') ? props.name.split('/').slice(1).join('/') : props.name)
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="tap-y inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-ds-xs transition-colors duration-micro"
    :class="active
      ? 'bg-accent text-[var(--accent-ink)] border-transparent font-semibold'
      : 'border-line text-ink-2 hover:border-accent/40 hover:text-accent-text'"
    :title="name"
  >
    <span>#{{ label }}</span>
    <span v-if="count != null" class="font-mono opacity-60">{{ count }}</span>
  </NuxtLink>
  <button
    v-else-if="clickable"
    type="button"
    class="tap-y inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-ds-xs transition-colors duration-micro"
    :class="active
      ? 'bg-accent text-[var(--accent-ink)] border-transparent font-semibold'
      : 'border-line text-ink-2 hover:border-accent/40 hover:text-accent-text'"
    :title="name"
    :aria-pressed="active"
  >
    <span>#{{ label }}</span>
    <span v-if="count != null" class="font-mono opacity-60">{{ count }}</span>
  </button>
  <span
    v-else
    class="inline-flex items-center gap-1 h-[22px] px-2 rounded-full border border-line text-ink-2 text-ds-xs"
    :title="name"
  >
    <span>#{{ label }}</span>
    <span v-if="count != null" class="font-mono opacity-60">{{ count }}</span>
  </span>
</template>
