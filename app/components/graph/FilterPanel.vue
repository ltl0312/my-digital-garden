<template>
  <!-- 左栏：筛选面板（计划书 T2.1 / T2.3 / T4.2） -->
  <div class="flex flex-col gap-4 p-3">
    <!-- 可见范围 -->
    <section>
      <h3 class="text-[12px] font-semibold text-ink-3 mb-2">可见范围</h3>
      <div class="space-y-1" role="radiogroup" aria-label="可见范围">
        <label
          v-for="opt in SCOPE_OPTIONS"
          :key="opt.value"
          class="flex items-center gap-2 h-8 px-2 rounded-[6px] cursor-pointer text-ds-sm text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
          :class="filter.state.scope === opt.value ? 'text-ink bg-surface-3' : ''"
        >
          <input
            type="radio"
            class="accent-[var(--accent)]"
            :value="opt.value"
            :checked="filter.state.scope === opt.value"
            @change="filter.setScope(opt.value)"
          />
          <span>{{ opt.label }}</span>
          <span v-if="opt.value === 'neighbors' && !hasSelection" class="ml-auto text-[11px] text-ink-3">需先选中</span>
        </label>
      </div>
      <p v-if="filter.state.scope === 'path'" class="mt-1.5 text-[11px] text-ink-3 leading-relaxed">
        {{ pathSummary }}
      </p>
    </section>

    <!-- 按领域（graph-legend 语义钩子：色点 + 名称 + 计数） -->
    <section>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-[12px] font-semibold text-ink-3">按领域</h3>
        <button
          v-if="filter.state.domains.length"
          type="button"
          class="text-[11px] text-accent hover:underline"
          @click="filter.state.domains = []"
        >
          清除
        </button>
      </div>
      <ul class="space-y-0.5 max-h-[30vh] overflow-y-auto" data-testid="graph-legend">
        <li v-for="d in domains" :key="d.name">
          <label class="flex items-center gap-2 h-7 px-2 rounded-[6px] cursor-pointer text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro">
            <input
              type="checkbox"
              class="accent-[var(--accent)] shrink-0"
              :checked="filter.state.domains.includes(d.name)"
              @change="filter.toggleDomain(d.name)"
            />
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: d.color }"></span>
            <span class="flex-1 truncate" :title="d.name">{{ d.name }}</span>
            <span class="font-mono text-ink-3 tabular-nums shrink-0">{{ d.count }}</span>
          </label>
        </li>
        <li v-if="!domains.length" class="px-2 py-1 text-[12px] text-ink-3">暂无领域数据</li>
      </ul>
    </section>

    <!-- 按成熟度 -->
    <section>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-[12px] font-semibold text-ink-3">按成熟度</h3>
        <button
          v-if="filter.state.maturities.length"
          type="button"
          class="text-[11px] text-accent hover:underline"
          @click="filter.state.maturities = []"
        >
          清除
        </button>
      </div>
      <ul class="space-y-0.5" data-testid="graph-maturity-filter">
        <li v-for="b in maturityBuckets" :key="b.key">
          <label class="flex items-center gap-2 h-7 px-2 rounded-[6px] cursor-pointer text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro">
            <input
              type="checkbox"
              class="accent-[var(--accent)] shrink-0"
              :checked="filter.state.maturities.includes(b.key)"
              @change="filter.toggleMaturity(b.key)"
            />
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: MATURITY_COLORS[b.key] }"></span>
            <span class="flex-1 truncate">{{ b.label }}</span>
            <span class="font-mono text-ink-3 tabular-nums shrink-0">{{ b.count }}</span>
          </label>
        </li>
      </ul>
    </section>

    <!-- 已选标签（来自节点详情「标签行」或搜索面板「标签」组；未选中时不占位） -->
    <section v-if="filter.state.tags.length">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-[12px] font-semibold text-ink-3">按标签</h3>
        <button type="button" class="text-[11px] text-accent hover:underline" @click="filter.clearTags()">清除</button>
      </div>
      <ul class="flex flex-wrap gap-1" data-testid="graph-tag-filter">
        <li v-for="t in filter.state.tags" :key="t">
          <button
            type="button"
            class="h-[22px] px-2 rounded-full border border-accent/40 bg-[var(--accent-soft)] text-[12px] text-ink inline-flex items-center gap-1 transition-colors duration-micro hover:border-accent/70"
            :aria-label="`移除标签 ${t}`"
            @click="filter.toggleTag(t)"
          >
            <span>#{{ t }}</span>
            <span aria-hidden="true">×</span>
          </button>
        </li>
      </ul>
    </section>

    <!-- 关系类型 -->
    <section>
      <h3 class="text-[12px] font-semibold text-ink-3 mb-2">关系类型</h3>
      <div class="space-y-0.5">
        <button
          v-for="k in EDGE_KINDS"
          :key="k"
          type="button"
          class="w-full flex items-center gap-2 h-8 px-2 rounded-[6px] text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro text-left"
          role="switch"
          :aria-checked="filter.isKindOn(k)"
          :data-testid="`graph-kind-${k}`"
          @click="filter.toggleKind(k)"
        >
          <span
            class="w-7 h-4 rounded-full shrink-0 relative transition-colors duration-micro"
            :class="filter.isKindOn(k) ? 'bg-[var(--accent)]' : 'bg-surface-3 border border-line'"
          >
            <span
              class="absolute top-0.5 w-3 h-3 rounded-full bg-surface shadow-ds1 transition-all duration-micro"
              :class="filter.isKindOn(k) ? 'left-3.5' : 'left-0.5'"
            ></span>
          </span>
          <span class="flex-1">{{ EDGE_KIND_LABEL[k] }}</span>
          <span class="font-mono text-ink-3 tabular-nums shrink-0">
            {{ k === 'link' ? stats.linkCount : stats.tagEdgeCount }}
          </span>
        </button>
      </div>
      <p v-if="filter.edgeKindHint.value" class="mt-1.5 text-[11px] text-[var(--hue-32)] leading-relaxed">
        {{ filter.edgeKindHint.value }}
      </p>
    </section>

    <!-- 显示 -->
    <section>
      <h3 class="text-[12px] font-semibold text-ink-3 mb-2">显示</h3>
      <div class="space-y-0.5">
        <label class="flex items-center gap-2 h-8 px-2 rounded-[6px] cursor-pointer text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro">
          <input v-model="filter.state.showLabels" type="checkbox" class="accent-[var(--accent)] shrink-0" />
          <span>常显标签</span>
        </label>
        <label class="flex items-center gap-2 h-8 px-2 rounded-[6px] cursor-pointer text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro">
          <input v-model="filter.state.showIsolated" type="checkbox" class="accent-[var(--accent)] shrink-0" />
          <span>孤立节点</span>
          <span class="ml-auto font-mono text-ink-3 tabular-nums shrink-0">{{ stats.isolatedCount }}</span>
        </label>
        <button
          type="button"
          class="w-full flex items-center gap-2 h-8 px-2 rounded-[6px] text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro text-left"
          role="switch"
          :aria-checked="physics"
          data-testid="graph-physics-toggle"
          @click="emit('togglePhysics')"
        >
          <span
            class="w-7 h-4 rounded-full shrink-0 relative transition-colors duration-micro"
            :class="physics ? 'bg-[var(--accent)]' : 'bg-surface-3 border border-line'"
          >
            <span
              class="absolute top-0.5 w-3 h-3 rounded-full bg-surface shadow-ds1 transition-all duration-micro"
              :class="physics ? 'left-3.5' : 'left-0.5'"
            ></span>
          </span>
          <span class="flex-1">物理引擎</span>
          <span v-if="!physics && converged" class="text-[11px] text-ink-3 shrink-0">已收敛</span>
        </button>
        <button
          v-if="!physics"
          type="button"
          class="w-full h-8 rounded-[6px] border border-line text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
          data-testid="graph-reheat"
          @click="emit('togglePhysics')"
        >
          重新点火
        </button>
      </div>
    </section>

    <!-- 渲染状态条（A12） -->
    <section class="rounded-ctl border border-line bg-surface-2 p-2.5">
      <h3 class="text-[12px] font-semibold text-ink-3 mb-1.5">渲染状态</h3>
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-ink-3 tabular-nums">
        <div class="flex justify-between"><dt>FPS</dt><dd class="text-ink-2">{{ renderStatus.fps }}</dd></div>
        <div class="flex justify-between"><dt>首帧</dt><dd class="text-ink-2">{{ renderStatus.firstPaintMs }}ms</dd></div>
        <div class="flex justify-between"><dt>节点</dt><dd class="text-ink-2">{{ renderStatus.nodeCount }}</dd></div>
        <div class="flex justify-between"><dt>连接</dt><dd class="text-ink-2">{{ renderStatus.edgeCount }}</dd></div>
        <div class="flex justify-between"><dt>绘制</dt><dd class="text-ink-2">{{ renderStatus.drawnCount }}</dd></div>
        <div class="flex justify-between"><dt>分级</dt><dd class="text-ink-2">{{ renderStatus.tier === 'svg' ? 'SVG' : 'Canvas' }}</dd></div>
      </dl>
      <p class="mt-1.5 text-[11px] text-ink-3 leading-relaxed">{{ tierHint }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { EDGE_KINDS, EDGE_KIND_LABEL, MATURITY_COLORS, RENDER_TIERS } from '~/lib/graph-constants'
import type { GraphStats, ScopeMode } from '~/lib/graph-types'
import type { DomainFacetItem, MaturityBucket } from '~/composables/useGraphData'
import type { useGraphFilter } from '~/composables/useGraphFilter'

const props = defineProps<{
  filter: ReturnType<typeof useGraphFilter>
  stats: GraphStats
  domains: DomainFacetItem[]
  maturityBuckets: MaturityBucket[]
  hasSelection: boolean
  physics: boolean
  converged: boolean
  renderStatus: { fps: number; firstPaintMs: number; nodeCount: number; edgeCount: number; drawnCount: number; tier: string }
}>()

const emit = defineEmits<{ (e: 'togglePhysics'): void }>()

const SCOPE_OPTIONS: { value: ScopeMode; label: string }[] = [
  { value: 'all', label: '全图' },
  { value: 'neighbors', label: '2 跳邻居' },
  { value: 'path', label: '最短路径' }
]

const pathSummary = computed(() => {
  const f = props.filter
  if (!f.pathFrom.value) return '依次点选两个节点'
  if (!f.pathTo.value) return '已选起点，再点一个终点'
  const n = f.pathNodeIds.value?.length || 0
  return n ? `路径长度 ${n - 1} 跳` : '两点之间没有连接'
})

const tierHint = computed(() => {
  if (props.renderStatus.tier === 'svg') return `节点数 ≤ ${RENDER_TIERS.svg}，SVG 渲染（可逐点命中）`
  if (props.renderStatus.nodeCount > RENDER_TIERS.canvas) return `节点数 > ${RENDER_TIERS.canvas}，只绘制度数 Top ${RENDER_TIERS.topN}`
  return 'Canvas 渲染，标签走 DOM 层'
})
</script>
