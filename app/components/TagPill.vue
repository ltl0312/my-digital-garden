<script setup lang="ts">
// 标签胶囊（spec 6 三件套）：统一高度与圆角；可选计数、可选跳转
const props = withDefaults(defineProps<{
  name: string
  count?: number
  /** 传 to 变成链接（列表页跳筛选）；否则渲染为按钮由父级处理点击 */
  to?: string
  active?: boolean
}>(), { active: false })

const label = computed(() => props.name.includes('/') ? props.name.split('/').slice(1).join('/') : props.name)
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-[12px] transition-colors duration-micro"
    :class="active
      ? 'bg-accent text-[var(--accent-ink)] border-transparent font-semibold'
      : 'border-line text-ink-2 hover:border-accent/40 hover:text-accent'"
    :title="name"
  >
    <span>#{{ label }}</span>
    <span v-if="count != null" class="font-mono opacity-60">{{ count }}</span>
  </NuxtLink>
  <button
    v-else
    type="button"
    class="inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-[12px] transition-colors duration-micro"
    :class="active
      ? 'bg-accent text-[var(--accent-ink)] border-transparent font-semibold'
      : 'border-line text-ink-2 hover:border-accent/40 hover:text-accent'"
    :title="name"
    :aria-pressed="active"
  >
    <span>#{{ label }}</span>
    <span v-if="count != null" class="font-mono opacity-60">{{ count }}</span>
  </button>
</template>
