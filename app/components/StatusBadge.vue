<script setup lang="ts">
// 成熟度徽章（spec 6 三件套之一）：成熟度 → 语义色 + 图标
// 数据现状：287 篇全部为 SEEDLING 时自然呈单色，如实反映数据（spec 5.5 同一原则）
import { Sprout, Leaf, TreeDeciduous } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  maturity: string
  /** compact 隐藏文字只留图标（列表紧凑模式用） */
  compact?: boolean
}>(), { compact: false })

const meta = computed(() => {
  switch (props.maturity) {
    case 'EVERGREEN':
      return { icon: TreeDeciduous, label: '常青', cls: 'text-evergreen border-evergreen/30 bg-[color-mix(in_srgb,var(--evergreen)_10%,transparent)]' }
    case 'GROWING':
      return { icon: Leaf, label: '生长中', cls: 'text-growing border-growing/30 bg-[color-mix(in_srgb,var(--growing)_10%,transparent)]' }
    default:
      return { icon: Sprout, label: '幼苗', cls: 'text-seedling border-seedling/30 bg-[color-mix(in_srgb,var(--seedling)_10%,transparent)]' }
  }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-[12px] font-semibold shrink-0"
    :class="meta.cls"
    :title="`成熟度：${meta.label}`"
  >
    <component :is="meta.icon" class="w-3 h-3" />
    <span v-if="!compact">{{ meta.label }}</span>
  </span>
</template>
