<script setup lang="ts">
// FacetList（spec ch.6）：领域行 = 色块 + 名称 + 占比条 + 数量；点击即筛选。
// 数据来源：知识区一级目录（useFacets 动态发现），点击跳 /notes?dir=<路径>
import type { DomainFacet } from '~/composables/useFacets'

defineProps<{ facets: DomainFacet[]; activeDir?: string }>()
</script>

<template>
  <ul class="space-y-0.5">
    <li v-for="f in facets" :key="f.name">
      <NuxtLink
        :to="f.dir ? `/notes?dir=${encodeURIComponent(f.dir)}` : '/notes'"
        class="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors duration-micro"
        :class="activeDir === f.dir
          ? 'bg-[var(--accent-soft)] text-ink'
          : 'hover:bg-surface-3 text-ink-2 hover:text-ink'"
        :title="f.dir ? `筛选：${f.dir}（${f.count} 篇）` : `其他（${f.count} 篇）`"
      >
        <span class="w-2.5 h-2.5 rounded-[3px] shrink-0 hue-chip" :style="{ '--h': `var(${f.hueVar})` }"></span>
        <span class="flex-1 text-ds-sm truncate">{{ f.name }}</span>
        <span class="w-14 h-1 rounded-full bg-surface-3 overflow-hidden shrink-0">
          <span
            class="block h-full rounded-full hue-bar transition-[width] duration-base ease-dawn"
            :style="{ '--h': `var(${f.hueVar})`, width: Math.max(3, Math.round(f.share * 100)) + '%' }"
          ></span>
        </span>
        <span class="w-8 text-right text-xs font-mono text-ink-3 tabular-nums">{{ f.count }}</span>
      </NuxtLink>
    </li>
    <li v-if="!facets.length" class="px-2.5 py-2 text-xs text-ink-3">未发现领域目录</li>
  </ul>
</template>
