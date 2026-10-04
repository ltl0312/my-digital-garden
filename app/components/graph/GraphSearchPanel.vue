<template>
  <!-- 图谱搜索（计划书 T2.4）：只过滤前端已有字段，不做正文全文扫描 -->
  <div ref="rootRef" class="relative w-full">
    <div class="relative">
      <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
      <input
        ref="inputRef"
        v-model="query"
        type="search"
        placeholder="定位笔记…"
        aria-label="搜索笔记、标签、领域或命令"
        class="w-full pl-9 pr-8 h-9 rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds1 text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
        @focus="open = true"
        @keydown="onKeydown"
      />
      <button
        v-if="query"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-ink-3 hover:text-ink"
        aria-label="清除搜索"
        @click="query = ''"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <div
      v-if="open"
      class="absolute left-0 mt-1.5 z-40 w-[min(420px,calc(100vw-1.5rem))] max-h-[60vh] overflow-y-auto rounded-card border border-line bg-surface shadow-ds3 p-1"
      role="listbox"
      data-testid="graph-search-panel"
    >
      <template v-if="groups.length">
        <div v-for="g in groups" :key="g.key" class="py-0.5">
          <p class="px-2.5 py-1 text-[11px] font-semibold text-ink-3">{{ g.label }}</p>
          <button
            v-for="item in g.items"
            :key="item.id"
            type="button"
            class="w-full text-left px-2.5 py-1.5 rounded-[6px] flex items-center gap-2 transition-colors duration-micro"
            :class="item.id === activeId ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'"
            role="option"
            :aria-selected="item.id === activeId"
            @mouseenter="activeId = item.id"
            @click="run(item)"
          >
            <component :is="item.icon" class="w-3.5 h-3.5 shrink-0" :class="item.iconClass" />
            <span class="flex-1 min-w-0 truncate text-ds-sm">
              <span v-for="(seg, i) in item.segments" :key="i" :class="seg.hit ? 'text-accent font-medium' : ''">{{ seg.text }}</span>
            </span>
            <span v-if="item.hint" class="shrink-0 text-[11px] text-ink-3">{{ item.hint }}</span>
          </button>
        </div>
      </template>
      <p v-else class="px-2.5 py-3 text-[12px] text-ink-3">
        {{ query.trim() ? '没有匹配的笔记、标签或领域' : '输入关键词搜索笔记标题、标签、目录与摘要' }}
      </p>

      <div class="mt-1 pt-1.5 border-t border-line flex items-center justify-between px-2.5 pb-1">
        <span class="text-[11px] text-ink-3">{{ totalCount }} 条结果 · {{ elapsedMs }} ms</span>
        <span class="text-[11px] text-ink-3 font-mono">↑↓ 选择 · Enter 打开 · Esc 关闭</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Crosshair, FileText, Hash, Layers, ListOrdered, PlusCircle, Route, Search, X } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { GraphNodeProp } from '~/components/GraphView.vue'
import type { DomainFacetItem, TagFacetItem } from '~/composables/useGraphData'

const props = defineProps<{
  nodes: GraphNodeProp[]
  domains: DomainFacetItem[]
  tags: TagFacetItem[]
}>()

const emit = defineEmits<{
  (e: 'selectNote', id: string): void
  (e: 'onlyDomain', name: string): void
  (e: 'tag', name: string): void
  (e: 'command', name: 'sort-degree' | 'find-path' | 'new-note'): void
}>()

interface Segment { text: string; hit: boolean }
interface Item {
  id: string
  label: string
  segments: Segment[]
  icon: Component
  iconClass: string
  hint?: string
  run: () => void
}
interface Group { key: string; label: string; items: Item[] }

const query = ref('')
const open = ref(false)
const activeId = ref('')
const elapsedMs = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLDivElement | null>(null)

const MAX_PER_GROUP = 6

/** 命中即高亮：把匹配区间切成带 hit 标记的片段（不注入 HTML，避免 v-html） */
function segmentsOf(text: string, q: string): Segment[] {
  if (!q) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const out: Segment[] = []
  let from = 0
  let at = lower.indexOf(q, from)
  if (at < 0) return [{ text, hit: false }]
  while (at >= 0) {
    if (at > from) out.push({ text: text.slice(from, at), hit: false })
    out.push({ text: text.slice(at, at + q.length), hit: true })
    from = at + q.length
    at = lower.indexOf(q, from)
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false })
  return out
}

const groups = computed(() => {
  const t0 = performance.now()
  const q = query.value.trim().toLowerCase()

  const noteItems: Item[] = []
  const tagItems: Item[] = []
  const domainItems: Item[] = []

  if (q) {
    for (const n of props.nodes) {
      const hay = `${n.title}\n${n.tags.join(' ')}\n${n.dirPath}\n${n.summary || ''}`.toLowerCase()
      if (!hay.includes(q)) continue
      // 标题命中优先，其次是标签 / 目录 / 摘要
      const titleHit = n.title.toLowerCase().includes(q)
      const sub = n.tags.find(t => t.toLowerCase().includes(q))
        ? `#${n.tags.find(t => t.toLowerCase().includes(q))}`
        : (n.dirPath || '')
      noteItems.push({
        id: `note:${n.id}`,
        label: n.title,
        segments: segmentsOf(n.title, q),
        icon: titleHit ? FileText : Crosshair,
        iconClass: 'text-ink-3',
        hint: sub,
        run: () => emit('selectNote', n.id)
      })
      if (noteItems.length >= MAX_PER_GROUP) break
    }
    for (const t of props.tags) {
      if (!t.name.toLowerCase().includes(q)) continue
      tagItems.push({
        id: `tag:${t.name}`,
        label: `#${t.name}`,
        segments: segmentsOf(`#${t.name}`, q),
        icon: Hash,
        iconClass: 'text-ink-3',
        hint: `${t.count}`,
        run: () => emit('tag', t.name)
      })
      if (tagItems.length >= MAX_PER_GROUP) break
    }
    for (const d of props.domains) {
      if (!d.name.toLowerCase().includes(q)) continue
      domainItems.push({
        id: `domain:${d.name}`,
        label: d.name,
        segments: segmentsOf(d.name, q),
        icon: Layers,
        iconClass: 'text-ink-3',
        hint: `只看此领域 · ${d.count}`,
        run: () => emit('onlyDomain', d.name)
      })
      if (domainItems.length >= MAX_PER_GROUP) break
    }
  }

  const commands: Item[] = [
    {
      id: 'cmd:sort-degree',
      label: '按度数排序节点',
      segments: segmentsOf('按度数排序节点', q),
      icon: ListOrdered,
      iconClass: 'text-accent',
      hint: '聚焦度数最高的节点',
      run: () => emit('command', 'sort-degree')
    },
    {
      id: 'cmd:find-path',
      label: '查找两篇笔记最短路径',
      segments: segmentsOf('查找两篇笔记最短路径', q),
      icon: Route,
      iconClass: 'text-accent',
      hint: '进入选点模式',
      run: () => emit('command', 'find-path')
    },
    {
      id: 'cmd:new-note',
      label: '新建笔记并在图谱中定位',
      segments: segmentsOf('新建笔记并在图谱中定位', q),
      icon: PlusCircle,
      iconClass: 'text-accent',
      hint: '',
      run: () => emit('command', 'new-note')
    }
  ]

  const out: Group[] = []
  if (noteItems.length) out.push({ key: 'note', label: '笔记', items: noteItems })
  if (tagItems.length) out.push({ key: 'tag', label: '标签', items: tagItems })
  if (domainItems.length) out.push({ key: 'domain', label: '领域', items: domainItems })
  out.push({ key: 'command', label: '命令', items: commands })

  elapsedMs.value = Math.round(performance.now() - t0)
  return out
})

const flat = computed(() => groups.value.flatMap(g => g.items))
const totalCount = computed(() => flat.value.length)

watch(flat, (list) => {
  if (!list.some(i => i.id === activeId.value)) activeId.value = list[0]?.id || ''
})

function run(item: Item) {
  item.run()
  open.value = false
  query.value = ''
}

function move(delta: number) {
  const list = flat.value
  if (!list.length) return
  const idx = list.findIndex(i => i.id === activeId.value)
  const next = (idx + delta + list.length) % list.length
  activeId.value = list[next]!.id
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flat.value.find(i => i.id === activeId.value)
    if (item) run(item)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    open.value = false
  } else if (e.key === 'Tab') {
    // Tab 在分组之间跳转（笔记 → 标签 → 领域 → 命令）
    e.preventDefault()
    const list = groups.value
    const curIdx = list.findIndex(g => g.items.some(i => i.id === activeId.value))
    const step = e.shiftKey ? -1 : 1
    const nextGroup = list[(curIdx + step + list.length) % list.length]
    if (nextGroup?.items[0]) activeId.value = nextGroup.items[0].id
  }
}

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return
  const root = rootRef.value
  if (root && !root.contains(e.target as Node)) open.value = false
}

function focus() {
  open.value = true
  inputRef.value?.focus()
  inputRef.value?.select()
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown, true))

defineExpose({ focus, close: () => { open.value = false } })
</script>
