<script setup lang="ts">
// 空状态（spec 7：空状态给出原因 + 下一步动作，不只是「没有数据」）
import { SearchX } from 'lucide-vue-next'

withDefaults(defineProps<{
  title?: string
  reason?: string
  actionText?: string
  actionTo?: string
}>(), {
  title: '没有找到匹配的笔记'
})
</script>

<template>
  <div class="py-14 text-center rounded-card border border-dashed border-line">
    <SearchX class="w-8 h-8 mx-auto text-ink-3 mb-3" />
    <p class="text-ds-base font-semibold text-ink mb-1">{{ title }}</p>
    <p v-if="reason" class="text-ds-sm text-ink-2 max-w-[46ch] mx-auto leading-summary">{{ reason }}</p>
    <slot />
    <NuxtLink
      v-if="actionText && actionTo"
      :to="actionTo"
      class="mt-5 inline-flex px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] hover:opacity-90 transition-opacity duration-micro"
    >{{ actionText }}</NuxtLink>
  </div>
</template>
