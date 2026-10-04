<!--
  批量上色面板（需求：控制面板里也能直接选一批节点批量上色，可按路径/名称/内容筛选）。
  面板本身不含圈选逻辑——圈选在 useGraphBatchColor 里（路径/名称本地过滤，正文走服务端检索），
  这里只负责把 query / fields / 匹配结果画出来，并把「上色 / 清除」意图发回页面。
-->
<template>
  <section
    class="flex flex-col gap-3 p-3 border-t border-line"
    data-testid="graph-batch-panel"
    aria-label="批量上色"
  >
    <header class="flex items-center justify-between">
      <h2 class="text-[12px] font-semibold text-ink-3">批量上色</h2>
      <span
        class="text-[11px] text-ink-3 tabular-nums"
        data-testid="graph-batch-sync"
        :title="syncTitle"
      >
        <template v-if="syncError">同步失败</template>
        <template v-else-if="syncing">同步中…</template>
        <template v-else-if="syncedLabel">{{ syncedLabel }}</template>
        <template v-else>未同步</template>
      </span>
    </header>

    <!-- 关键词 -->
    <div>
      <label for="graph-batch-query" class="sr-only">圈选关键词</label>
      <input
        id="graph-batch-query"
        :value="query"
        type="search"
        inputmode="search"
        autocomplete="off"
        placeholder="关键词：路径 / 名称 / 正文…"
        class="w-full h-8 px-2.5 rounded-[6px] border border-line bg-surface-2 text-[12px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)] transition-colors duration-micro"
        data-testid="graph-batch-query"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      >
      <div class="mt-1.5 flex items-center gap-2.5">
        <label
          v-for="f in BATCH_FIELDS"
          :key="f.value"
          class="flex items-center gap-1 text-[11px] text-ink-2 cursor-pointer"
          :title="f.hint"
        >
          <input
            type="checkbox"
            class="w-3.5 h-3.5 cursor-pointer accent-[var(--accent)]"
            :data-testid="`graph-batch-field-${f.value}`"
            :checked="fields[f.value]"
            :aria-label="`按${f.label}筛选`"
            @change="emit('toggleField', f.value)"
          >
          {{ f.label }}
        </label>
      </div>
      <p
        class="mt-1.5 text-[11px] leading-relaxed"
        :class="contentError ? 'text-[var(--danger,#B4232A)]' : 'text-ink-3'"
        data-testid="graph-batch-summary"
      >
        {{ summary }}
      </p>
    </div>

    <!-- 匹配到的节点（最多列 8 个，点一个就定位过去） -->
    <div v-if="matchedNodes.length" data-testid="graph-batch-list">
      <ul class="space-y-0.5">
        <li v-for="n in matchedNodes.slice(0, 8)" :key="n.id">
          <button
            type="button"
            class="w-full flex items-center gap-1.5 text-left text-[11px] text-ink-2 hover:text-ink rounded-[4px] px-1 py-0.5 hover:bg-surface-3 transition-colors duration-micro"
            data-testid="graph-batch-item"
            :title="n.slug"
            @click="emit('locate', n.id)"
          >
            <span
              class="w-2 h-2 rounded-full shrink-0 border border-line"
              :style="{ background: colorMap[n.slug] || 'transparent' }"
            ></span>
            <span class="truncate">{{ n.title }}</span>
          </button>
        </li>
      </ul>
      <p v-if="matchedNodes.length > 8" class="mt-1 px-1 text-[11px] text-ink-3">
        还有 {{ matchedNodes.length - 8 }} 个…
      </p>
    </div>

    <!-- 色板：点一下立刻给匹配到的节点上色 -->
    <div>
      <div class="grid grid-cols-10 gap-1" data-testid="graph-batch-palette">
        <button
          v-for="c in NODE_COLOR_PALETTE"
          :key="c"
          type="button"
          class="h-5 rounded-[4px] border border-line transition-transform duration-micro hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
          :style="{ background: c }"
          :disabled="!matchedCount"
          :data-testid="`graph-batch-color-${c.slice(1)}`"
          :aria-label="`把匹配节点涂成 ${c}`"
          :title="`把匹配节点涂成 ${c}`"
          @click="emit('apply', c)"
        ></button>
      </div>
      <button
        type="button"
        class="mt-2 w-full h-8 rounded-[6px] border border-line text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro disabled:opacity-40"
        :disabled="!matchedCount"
        data-testid="graph-batch-clear"
        @click="emit('clearMatched')"
      >
        清除匹配节点的颜色
      </button>
      <p class="mt-1.5 text-[11px] text-ink-3 leading-relaxed">
        颜色按你的身份同步到服务端，换设备重新登录同一密钥即恢复。
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { BATCH_FIELDS, NODE_COLOR_PALETTE } from '~/lib/graph-constants'
import type { BatchFieldState, BatchNode } from '~/composables/useGraphBatchColor'

const props = defineProps<{
  query: string
  fields: BatchFieldState
  summary: string
  matchedNodes: BatchNode[]
  matchedCount: number
  colorMap: Record<string, string>
  syncing: boolean
  syncError: string | null
  lastSyncedAt: string | null
  /** 正文检索失败时的错误文本（只影响 summary 的配色） */
  contentError: string | null
}>()

const emit = defineEmits<{
  (e: 'update:query', v: string): void
  (e: 'toggleField', f: keyof BatchFieldState): void
  (e: 'apply', color: string): void
  (e: 'clearMatched'): void
  (e: 'locate', id: string): void
}>()

const syncedLabel = computed(() => {
  const iso = props.lastSyncedAt
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return '已同步'
  const hh = String(t.getHours()).padStart(2, '0')
  const mm = String(t.getMinutes()).padStart(2, '0')
  return `已同步 ${hh}:${mm}`
})

const syncTitle = computed(() => props.syncError || syncedLabel.value || '尚未与服务端同步')
</script>
