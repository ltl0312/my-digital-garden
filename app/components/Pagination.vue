<script setup lang="ts">
// 窗口化分页（spec 5.3：1 … 3 4 5 … 48 替代仅有前后两键）
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  page: number
  totalPages: number
}>()

const emit = defineEmits<{ (e: 'change', p: number): void }>()

/** 生成页码窗口：首页 / 末页恒定，当前项左右各 1 页，其余折叠为省略号 */
const items = computed<(number | '…')[]>(() => {
  const { page, totalPages } = props
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const set = new Set<number>([1, totalPages, page, page - 1, page + 1])
  const nums = [...set].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push('…')
    out.push(nums[i])
  }
  return out
})

const go = (p: number) => {
  if (p >= 1 && p <= props.totalPages && p !== props.page) emit('change', p)
}
</script>

<template>
  <nav class="flex items-center justify-center gap-1.5" aria-label="分页">
    <button
      class="w-9 h-9 rounded-ctl border border-line text-ink-2 flex items-center justify-center disabled:opacity-35 hover:bg-surface-3 transition-colors duration-micro"
      :disabled="page <= 1"
      aria-label="上一页"
      @click="go(page - 1)"
    >
      <ChevronLeft class="w-4 h-4" />
    </button>

    <template v-for="(it, i) in items" :key="i">
      <span v-if="it === '…'" class="w-9 h-9 flex items-center justify-center text-ink-3 text-ds-sm">…</span>
      <button
        v-else
        class="min-w-9 h-9 px-2 rounded-ctl text-ds-sm border transition-colors duration-micro"
        :class="it === page
          ? 'bg-accent text-[var(--accent-ink)] border-transparent font-semibold'
          : 'border-line text-ink-2 hover:bg-surface-3'"
        :aria-current="it === page ? 'page' : undefined"
        @click="go(it)"
      >{{ it }}</button>
    </template>

    <button
      class="w-9 h-9 rounded-ctl border border-line text-ink-2 flex items-center justify-center disabled:opacity-35 hover:bg-surface-3 transition-colors duration-micro"
      :disabled="page >= totalPages"
      aria-label="下一页"
      @click="go(page + 1)"
    >
      <ChevronRight class="w-4 h-4" />
    </button>
  </nav>
</template>
