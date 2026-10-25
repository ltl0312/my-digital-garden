<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import type { TagGroup } from '~/composables/useFacets'

// TagGroups（spec ch.6）：按命名空间前缀分组的标签云，组头带组内计数。
// 组默认展开「status / type + 数量最多的 3 组」，其余折叠；点击标签跳 /notes?tag=<全名>
const props = defineProps<{ groups: TagGroup[]; activeTag?: string }>()

const EXPANDED_DEFAULT = 3
const open = ref<Set<string>>(new Set())

const isOpen = (g: TagGroup, i: number) => open.value.has(g.ns) || (i < EXPANDED_DEFAULT && !closed.value.has(g.ns))
const closed = ref<Set<string>>(new Set())

const toggle = (g: TagGroup) => {
  const next = new Set(open.value)
  if (isOpen(g, 999)) {
    next.delete(g.ns)
    closed.value = new Set([...closed.value, g.ns])
  } else {
    next.add(g.ns)
    const c = new Set(closed.value); c.delete(g.ns); closed.value = c
  }
  open.value = next
}

const nsLabel = (ns: string) => ns === '未分组' ? '未分组' : ns

/**
 * 「未分组」不是"笔记没打标签"，而是**这些标签名里没有 `/` 前缀**。
 *
 * 分组规则是「按标签名的命名空间前缀分组」（见 useFacets.buildTagGroups：
 * `name.indexOf('/')`，没有斜杠就落进 未分组）。所以 AI 分配出 `Java`、`后端`
 * 这种扁平标签时，它们确实是真标签、也真的挂在笔记上，但因为没有前缀，
 * 面板里只能把它们堆在一起 —— 分配领域更不会改变这一点（领域不是标签）。
 *
 * 这里把这个规则直接写在界面上，避免用户以为是"分配没生效"。
 */
const NO_NS_HINT = '这些标签名里没有「命名空间/」前缀，无法归入某个分组。想让它们成组，把标签名改成「命名空间/名称」即可。'
const nsTitle = (ns: string) => ns === '未分组' ? NO_NS_HINT : ns
</script>

<template>
  <div class="space-y-2">
    <div v-for="(g, i) in props.groups" :key="g.ns">
      <button
        class="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs uppercase tracking-wider font-bold transition-colors duration-micro"
        :class="isOpen(g, i) ? 'text-ink-2 hover:bg-surface-3' : 'text-ink-3 hover:bg-surface-3'"
        :aria-expanded="isOpen(g, i)"
        :title="nsTitle(g.ns)"
        @click="toggle(g)"
      >
        <ChevronRight class="w-3 h-3 transition-transform duration-base ease-dawn" :class="isOpen(g, i) ? 'rotate-90' : ''" />
        <span class="flex-1 text-left">{{ nsLabel(g.ns) }}</span>
        <span class="font-mono tabular-nums">{{ g.total }}</span>
      </button>
      <p v-if="isOpen(g, i) && g.ns === '未分组'" class="pl-6 pr-2 pb-1 text-[11px] leading-snug text-ink-3">
        这些标签名里没有「命名空间/」前缀，所以没法归组。改成「命名空间/名称」就会自动进组。
      </p>
      <div v-if="isOpen(g, i)" class="flex flex-wrap gap-1 pl-4 pt-1">
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
