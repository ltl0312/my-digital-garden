<script setup lang="ts">
// 空状态 / 错误态（spec 7：不只说「没有数据」，要给原因 + 下一步动作）
//
// variant='error' 是批次 5 补的：三个主屏原先取数失败时只会渲染「空状态」，
// 用户看到「没有笔记」却不知道是网络断了 —— 把失败伪装成「本来就没有」是最糟的一种。
// 错误态给重试按钮，空状态给下一步入口，两者共用同一套排版。
import { SearchX, CloudOff } from 'lucide-vue-next'

withDefaults(defineProps<{
  title?: string
  reason?: string
  actionText?: string
  actionTo?: string
  variant?: 'empty' | 'error'
}>(), {
  title: '没有找到匹配的笔记',
  variant: 'empty'
})

const emit = defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <div
    class="py-14 text-center rounded-card border border-dashed"
    :class="variant === 'error' ? 'border-danger/40' : 'border-line'"
  >
    <CloudOff v-if="variant === 'error'" class="w-8 h-8 mx-auto text-danger mb-3" />
    <SearchX v-else class="w-8 h-8 mx-auto text-ink-3 mb-3" />
    <p class="text-ds-base font-semibold text-ink mb-1">{{ title }}</p>
    <p v-if="reason" class="text-ds-sm text-ink-2 max-w-[46ch] mx-auto leading-summary">{{ reason }}</p>
    <slot />
    <button
      v-if="variant === 'error'"
      type="button"
      class="mt-5 inline-flex items-center justify-center px-4 h-11 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] hover:opacity-90 transition-opacity duration-micro"
      @click="emit('retry')"
    >重试</button>
    <NuxtLink
      v-else-if="actionText && actionTo"
      :to="actionTo"
      class="mt-5 inline-flex px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] hover:opacity-90 transition-opacity duration-micro"
    >{{ actionText }}</NuxtLink>
  </div>
</template>
