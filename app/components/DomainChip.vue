<script setup lang="ts">
// 领域徽章（spec 6 三件套）：7 领域 + 其他，色相来自 DAWN 色族令牌
import { hueVarOf } from '~/composables/useFacets'

withDefaults(defineProps<{
  name: string
  /** 覆盖色相变量名（如 --hue-backend）；缺省按领域名映射 */
  hue?: string
  size?: 'sm' | 'md'
}>(), { size: 'md' })

const hueVar = (n: string, h?: string) => h || hueVarOf(n)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full hue-soft shrink-0 border border-line/60"
    :class="size === 'sm' ? 'h-[22px] px-2 text-[12px]' : 'h-[24px] px-2.5 text-[12px]'"
    :style="{ '--h': `var(${hueVar(name, hue)})` }"
  >
    <i class="w-1.5 h-1.5 rounded-full hue-chip" :style="{ '--h': `var(${hueVar(name, hue)})` }"></i>
    <span class="font-semibold">{{ name }}</span>
  </span>
</template>
