<script setup lang="ts">
// 知识图谱（spec 5.5）：通栏画布 + 四角浮层
// 左上「定位笔记」/ 右上工具条 / 左下分组图例 / 右下统计；设置改为浮层，不再挤占画布
import { Network, Maximize2, Zap, Settings2, ZoomIn, ZoomOut, Search, Locate } from 'lucide-vue-next'
import { DOMAIN_HUE_DEG, domainColor, domainOfSlug } from '~/composables/useFacets'

interface GraphSettings {
  groupBy: 'domain' | 'maturity' | 'tag'
  colors: Record<string, string>
  sizeMode: 'fixed' | 'degree'
  nodeSize: number
}

// v2：默认着色口径从「成熟度」改为「领域」（spec 5.5），旧键不作数以免沿用旧默认
const SETTINGS_KEY = 'garden-graph-settings-v2'

const MATURITY_COLORS: Record<string, string> = {
  SEEDLING: 'hsl(38 62% 46%)',
  GROWING: 'hsl(198 60% 44%)',
  EVERGREEN: 'hsl(160 56% 40%)'
}
const MATURITY_LABEL: Record<string, string> = { SEEDLING: '幼苗', GROWING: '成长', EVERGREEN: '常青' }
const TAG_PALETTE = ['#16a34a', '#0284c7', '#9333ea', '#8C6D46', '#B87A8C', '#7A8CB8', '#8CB05B', '#B8A05B']

const requestFetch = useRequestFetch()
const { data: graph } = await useAsyncData('graph-data', () => requestFetch('/api/notes/graph'))

/** 节点补上领域（由 slug 派生，与列表页同一套规则） */
const nodes = computed(() => (graph.value?.nodes || []).map((n: any) => ({
  ...n,
  domain: domainOfSlug(n.slug).domain || '其他'
})))

const domainNames = computed(() => [...new Set(nodes.value.map((n: any) => n.domain))].sort())

const defaultDomainColors = () => {
  const out: Record<string, string> = {}
  for (const d of Object.keys(DOMAIN_HUE_DEG)) out[d] = domainColor(d)
  return out
}

const emptySettings = (): GraphSettings => ({
  groupBy: 'domain',
  colors: { ...MATURITY_COLORS, ...defaultDomainColors() },
  sizeMode: 'degree',
  nodeSize: 18
})

const loadSettings = (): GraphSettings => {
  try {
    return { ...emptySettings(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return emptySettings()
  }
}

const settings = ref<GraphSettings>(loadSettings())
watch(settings, s => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)), { deep: true })

const showSettings = ref(false)
const graphRef = ref<InstanceType<typeof GraphView> | null>(null)
const physicsActive = ref(true)

const resetLayout = () => graphRef.value?.resetLayout()
const togglePhysics = () => graphRef.value?.togglePhysics()
const zoomIn = () => graphRef.value?.zoomBy(1.35)
const zoomOut = () => graphRef.value?.zoomBy(1 / 1.35)
const fitView = () => graphRef.value?.fitView()

// 孤立度（度数为 0）：统计与图例都要用
const degreeMap = computed(() => {
  const m = new Map<string, number>()
  for (const e of graph.value?.edges || []) {
    m.set(e.source, (m.get(e.source) || 0) + 1)
    m.set(e.target, (m.get(e.target) || 0) + 1)
  }
  return m
})
const isolatedCount = computed(() => nodes.value.filter((n: any) => !degreeMap.value.has(n.id)).length)

/** 标签模式下为新出现的标签分配色板色 */
watchEffect(() => {
  if (settings.value.groupBy !== 'tag') return
  const tags = [...new Set(nodes.value.map((n: any) => n.primaryTag).filter(Boolean))] as string[]
  let idx = 0
  for (const t of tags) {
    if (!settings.value.colors[t]) settings.value.colors[t] = TAG_PALETTE[idx++ % TAG_PALETTE.length]
  }
})

/** 图例：随着色口径变化，含组内计数（真实统计） */
const legend = computed(() => {
  if (settings.value.groupBy === 'domain') {
    return domainNames.value.map(d => ({
      key: d,
      label: d,
      color: settings.value.colors[d] || domainColor(d),
      count: nodes.value.filter((n: any) => n.domain === d).length
    }))
  }
  if (settings.value.groupBy === 'maturity') {
    return ['EVERGREEN', 'GROWING', 'SEEDLING'].map(k => ({
      key: k,
      label: MATURITY_LABEL[k],
      color: settings.value.colors[k] || MATURITY_COLORS[k],
      count: nodes.value.filter((n: any) => (n.maturity || 'SEEDLING') === k).length
    }))
  }
  return [...new Set(nodes.value.map((n: any) => n.primaryTag || '未分类'))].map((t: any) => ({
    key: t,
    label: t,
    color: settings.value.colors[t] || '#8C6D46',
    count: nodes.value.filter((n: any) => (n.primaryTag || '未分类') === t).length
  }))
})

// 左上「定位笔记」
const locateQuery = ref('')
const matches = computed(() => {
  const q = locateQuery.value.trim().toLowerCase()
  if (!q) return []
  return nodes.value
    .filter((n: any) => n.title.toLowerCase().includes(q) || String(n.slug).toLowerCase().includes(q))
    .slice(0, 8)
})
const locate = (slug: string) => {
  const ok = graphRef.value?.focusNode(slug)
  if (ok) locateQuery.value = ''
}

useHead({ title: '知识图谱 · 拾光' })
</script>

<template>
  <div class="relative h-full min-h-[560px] w-full">
    <ClientOnly>
      <GraphView
        v-if="graph"
        ref="graphRef"
        :nodes="nodes"
        :edges="graph.edges"
        :settings="settings"
        v-model:physics-active="physicsActive"
      />
      <template #fallback>
        <div class="h-full flex items-center justify-center text-ink-3 text-ds-sm">图谱加载中…</div>
      </template>
    </ClientOnly>

    <!-- 左上：定位笔记（窄屏收窄，避免与右上工具条重叠） -->
    <div class="absolute left-3 sm:left-4 top-3 sm:top-4 z-20 w-[176px] sm:w-[236px] max-w-[calc(100%-1.5rem)]">
      <div class="relative">
        <Search class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
        <input
          v-model="locateQuery"
          placeholder="定位笔记…"
          class="w-full pl-9 pr-3 py-2 rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds1 text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
        />
      </div>
      <ul
        v-if="matches.length"
        class="mt-1.5 rounded-ctl border border-line bg-surface shadow-ds2 p-1 max-h-[240px] overflow-y-auto"
      >
        <li v-for="m in matches" :key="m.id">
          <button
            class="w-full text-left px-2.5 py-1.5 rounded-[6px] text-ds-sm text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors duration-micro flex items-center gap-2"
            @click="locate(m.slug)"
          >
            <Locate class="w-3.5 h-3.5 text-ink-3 shrink-0" />
            <span class="truncate">{{ m.title }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- 右上：工具条 -->
    <div class="absolute right-3 sm:right-4 top-3 sm:top-4 z-20 flex items-center gap-0.5 rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds1 p-1">
      <button class="w-8 h-8 rounded-[6px] flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro" title="放大" aria-label="放大" @click="zoomIn">
        <ZoomIn class="w-4 h-4" />
      </button>
      <button class="w-8 h-8 rounded-[6px] flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro" title="缩小" aria-label="缩小" @click="zoomOut">
        <ZoomOut class="w-4 h-4" />
      </button>
      <button class="w-8 h-8 rounded-[6px] flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro" title="适配全图" aria-label="适配全图" @click="fitView">
        <Maximize2 class="w-4 h-4" />
      </button>
      <button
        class="w-8 h-8 rounded-[6px] flex items-center justify-center transition-colors duration-micro"
        :class="physicsActive ? 'text-accent bg-[var(--accent-soft)]' : 'text-ink-3 hover:bg-surface-3'"
        :title="physicsActive ? '物理引擎运行中（点击停止）' : '启动物理引擎（重新点火）'"
        :aria-pressed="physicsActive"
        @click="togglePhysics"
      >
        <Zap class="w-4 h-4" />
      </button>
      <button
        class="w-8 h-8 rounded-[6px] flex items-center justify-center transition-colors duration-micro"
        :class="showSettings ? 'text-accent bg-[var(--accent-soft)]' : 'text-ink-2 hover:bg-surface-3'"
        title="图谱设置"
        aria-label="图谱设置"
        :aria-expanded="showSettings"
        @click="showSettings = !showSettings"
      >
        <Settings2 class="w-4 h-4" />
      </button>
    </div>

    <!-- 设置浮层（不再挤占画布） -->
    <div
      v-if="showSettings"
      class="absolute right-3 sm:right-4 top-[3.75rem] z-20 w-[262px] rounded-card border border-line bg-surface/95 backdrop-blur shadow-ds3 p-3.5 space-y-3"
    >
      <div class="flex items-center justify-between">
        <p class="text-[12px] font-semibold text-ink-3">图谱设置</p>
        <button class="text-[12px] text-accent hover:underline" @click="resetLayout">重置布局</button>
      </div>

      <label class="block">
        <span class="block text-[12px] text-ink-3 mb-1">着色</span>
        <select v-model="settings.groupBy" class="w-full px-2.5 py-1.5 rounded-ctl text-ds-sm bg-surface-2 border border-line text-ink outline-none focus:border-accent/60">
          <option value="domain">按领域</option>
          <option value="maturity">按成熟度</option>
          <option value="tag">按标签</option>
        </select>
      </label>

      <label class="block">
        <span class="block text-[12px] text-ink-3 mb-1">大小</span>
        <select v-model="settings.sizeMode" class="w-full px-2.5 py-1.5 rounded-ctl text-ds-sm bg-surface-2 border border-line text-ink outline-none focus:border-accent/60">
          <option value="degree">按链接数</option>
          <option value="fixed">固定</option>
        </select>
      </label>

      <label v-if="settings.sizeMode === 'fixed'" class="block">
        <span class="block text-[12px] text-ink-3 mb-1">节点大小 {{ settings.nodeSize }}</span>
        <input v-model.number="settings.nodeSize" type="range" min="10" max="40" class="w-full" />
      </label>

      <div v-if="settings.groupBy === 'domain'" class="pt-1 space-y-1.5 max-h-[180px] overflow-y-auto">
        <label v-for="g in legend" :key="g.key" class="flex items-center gap-2 text-[12px] text-ink-2">
          <input v-model="settings.colors[g.key]" type="color" class="w-5 h-5 rounded cursor-pointer border border-line bg-transparent" :title="g.label" />
          {{ g.label }}
        </label>
      </div>
    </div>

    <!-- 左下：分组图例（色块 + 名称 + 数量） -->
    <div v-if="graph" class="absolute left-3 sm:left-4 bottom-3 sm:bottom-4 z-20 w-[136px] sm:w-auto sm:max-w-[240px] rounded-card border border-line bg-surface/95 backdrop-blur shadow-ds1 p-2 sm:p-3">
      <p class="text-[12px] font-semibold text-ink-3 mb-2 flex items-center gap-1.5">
        <Network class="w-3.5 h-3.5" />{{ settings.groupBy === 'domain' ? '按领域' : settings.groupBy === 'maturity' ? '按成熟度' : '按标签' }}
      </p>
      <ul class="space-y-1 max-h-[26vh] overflow-y-auto">
        <li v-for="g in legend" :key="g.key" class="flex items-center gap-2 text-[12px] text-ink-2">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: g.color }"></span>
          <span class="flex-1 truncate">{{ g.label }}</span>
          <span class="font-mono text-ink-3 tabular-nums">{{ g.count }}</span>
        </li>
      </ul>
    </div>

    <!-- 右下：统计（窄屏纵向堆叠，避免与图例重叠） -->
    <div v-if="graph" class="absolute right-3 sm:right-4 bottom-3 sm:bottom-4 z-20 rounded-card border border-line bg-surface/95 backdrop-blur shadow-ds1 px-3 py-2 flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-3 text-[12px] font-mono text-ink-2">
      <span><b class="text-ink">{{ nodes.length }}</b> 节点</span>
      <span class="text-line hidden sm:inline">|</span>
      <span><b class="text-ink">{{ graph?.edges?.length || 0 }}</b> 连接</span>
      <span class="text-line hidden sm:inline">|</span>
      <span><b class="text-ink">{{ isolatedCount }}</b> 孤立</span>
    </div>
  </div>
</template>
