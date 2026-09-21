<script setup lang="ts">
// 权限清单（spec 8.4：每个角色都能看到自己的权限边界）
// ✓ 可做 / ✗ 不可做，可带子说明
import { Check, X } from 'lucide-vue-next'

defineProps<{
  items: { ok: boolean; text: string; note?: string }[]
}>()
</script>

<template>
  <ul class="space-y-2">
    <li v-for="(it, i) in items" :key="i" class="flex items-start gap-2">
      <span
        class="mt-[2px] w-4 h-4 rounded-full flex items-center justify-center shrink-0"
        :class="it.ok
          ? 'bg-[color-mix(in_srgb,var(--evergreen)_16%,transparent)] text-evergreen'
          : 'bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger'"
      >
        <component :is="it.ok ? Check : X" class="w-3 h-3" />
      </span>
      <span class="min-w-0">
        <span class="text-ds-sm leading-summary text-ink-2">{{ it.text }}</span>
        <span v-if="it.note" class="block text-[12px] text-ink-3 mt-0.5 leading-summary">{{ it.note }}</span>
      </span>
    </li>
  </ul>
</template>
