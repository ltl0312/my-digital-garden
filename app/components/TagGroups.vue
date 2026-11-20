<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import type { TagGroup } from '~/composables/useFacets'

// TagGroups（spec ch.6）：按命名空间前缀分组的标签云，组头带组内计数。
// 组**默认全收**（旧实现自动展开前 3 组，type / 前端 / 编程语言 一打开就摊着，等于把面板
// 变成了噪音墙）；点过的组会被记住 —— 切面板不丢（useState）、刷新也还在（localStorage），
// 见 useStickyList。点击标签跳 /notes?tag=<全名>
const props = defineProps<{ groups: TagGroup[]; activeTag?: string }>()

const stickyOpen = useStickyList('shell-tag-open-groups', 'garden-tag-open-groups')

const isOpen = (g: TagGroup) => stickyOpen.has(g.ns)
const toggle = (g: TagGroup) => stickyOpen.toggle(g.ns)

/**
 * 分组名由接口给（`/api/tags` 的 `group`，规则见 shared/tag-group.ts）。
 *
 * 历史裸标签（没有 `命名空间/` 前缀）以前会被整齐地堆进一个「未分组」组里 ——
 * 线上真实库有 974 个这样的标签，等于半个面板不可用。现在服务端按
 * 「人工映射 → 同篇共存证据 → 所在目录 → 自身命名空间」推导出分组，
 * 标签真名（`React`、`专题索引`）保持原样，点击筛选仍按原名走，所以界面
 * 不需要再解释"为什么没分组"。
 */
const nsTitle = (ns: string) => `${ns} · 组内标签合计计数`
</script>

<template>
  <div class="space-y-2" data-tag-groups>
    <div v-for="g in props.groups" :key="g.ns">
      <button
        data-tag-group
        class="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs uppercase tracking-wider font-bold transition-colors duration-micro"
        :class="isOpen(g) ? 'text-ink-2 hover:bg-surface-3' : 'text-ink-3 hover:bg-surface-3'"
        :aria-expanded="isOpen(g)"
        :title="nsTitle(g.ns)"
        @click="toggle(g)"
      >
        <ChevronRight class="w-3 h-3 transition-transform duration-base ease-dawn" :class="isOpen(g) ? 'rotate-90' : ''" />
        <span class="flex-1 text-left">{{ g.ns }}</span>
        <span class="font-mono tabular-nums">{{ g.total }}</span>
      </button>
      <div v-if="isOpen(g)" class="flex flex-wrap gap-1 pl-4 pt-1">
        <NuxtLink
          v-for="t in g.items"
          :key="t.name"
          :to="`/notes?tag=${encodeURIComponent(t.name)}`"
          class="text-xs px-2 py-0.5 rounded-full border transition-colors duration-micro"
          :class="props.activeTag === t.name
            ? 'border-accent text-accent bg-[var(--accent-soft)]'
            : 'border-line text-ink-2 hover:text-ink hover:border-ink-3'"
          :title="`#${t.name}（${t.count}）`"
        >
          {{ t.label }}<span class="ml-1 opacity-60 font-mono">{{ t.count }}</span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
