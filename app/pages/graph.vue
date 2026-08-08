<script setup lang="ts">
interface GraphSettings {
  groupBy: 'maturity' | 'tag'
  colors: Record<string, string>
  sizeMode: 'fixed' | 'degree'
  nodeSize: number
}

const SETTINGS_KEY = 'garden-graph-settings'
const DEFAULT_COLORS: Record<string, string> = {
  SEEDLING: '#8CB08C',
  GROWING: '#D4A359',
  EVERGREEN: '#6B9E78'
}
const TAG_PALETTE = ['#6B9E78', '#D4A359', '#8C6D46', '#5B8DB8', '#B87A8C', '#7A8CB8', '#8CB05B', '#B8A05B']

const loadSettings = (): GraphSettings => {
  try {
    return {
      groupBy: 'maturity', colors: { ...DEFAULT_COLORS }, sizeMode: 'degree', nodeSize: 18,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    }
  } catch {
    return { groupBy: 'maturity', colors: { ...DEFAULT_COLORS }, sizeMode: 'degree', nodeSize: 18 }
  }
}

const settings = ref<GraphSettings>(loadSettings())
watch(settings, s => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)), { deep: true })

const requestFetch = useRequestFetch()
const { data: graph } = await useAsyncData('graph-data', () => requestFetch('/api/notes/graph'))

// 标签分组：为 graph 数据中出现的全部标签分配色板色（页面级管理，GraphView 只读消费）
watchEffect(() => {
  if (!graph.value || settings.value.groupBy !== 'tag') return
  const tags = [...new Set(graph.value.nodes.map(n => n.primaryTag).filter(Boolean))] as string[]
  let idx = Object.keys(settings.value.colors).length - Object.keys(DEFAULT_COLORS).length
  for (const t of tags) {
    if (!settings.value.colors[t]) {
      settings.value.colors[t] = TAG_PALETTE[idx++ % TAG_PALETTE.length]
    }
  }
})

const graphRef = ref<InstanceType<typeof GraphView> | null>(null)
const resetLayout = () => graphRef.value?.resetLayout()

// 图例分组：maturity 固定三组；tag 模式显示全部标签色块
const legendGroups = computed(() => {
  if (settings.value.groupBy === 'tag') {
    return Object.entries(settings.value.colors).filter(([k]) => !DEFAULT_COLORS[k])
  }
  return Object.entries(DEFAULT_COLORS)
})

useHead({
  title: '知识图谱 · 拾光'
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-tight mb-2">知识图谱</h1>
      <p class="text-sm text-[var(--text-secondary)]">滚轮缩放 · 拖拽平移 · 节点拖拽后固定位置 · 位置与缩放自动保存</p>
    </header>

    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <select
        v-model="settings.groupBy"
        class="px-2 py-1.5 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--border-color)] outline-none focus:border-[var(--accent-color)]"
      >
        <option value="maturity">按成熟度着色</option>
        <option value="tag">按标签着色</option>
      </select>
      <select
        v-model="settings.sizeMode"
        class="px-2 py-1.5 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--border-color)] outline-none focus:border-[var(--accent-color)]"
      >
        <option value="degree">大小按链接数</option>
        <option value="fixed">固定大小</option>
      </select>
      <label v-if="settings.sizeMode === 'fixed'" class="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        节点大小
        <input v-model.number="settings.nodeSize" type="range" min="10" max="40" class="w-28" />
        <span>{{ settings.nodeSize }}</span>
      </label>
      <button
        class="px-3 py-1.5 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition"
        @click="resetLayout"
      >↺ 重置布局</button>
    </div>

    <div v-if="legendGroups.length" class="flex flex-wrap gap-3 mb-4">
      <label
        v-for="[name, color] in legendGroups"
        :key="name"
        class="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
      >
        <input v-model="settings.colors[name]" type="color" class="w-5 h-5 rounded cursor-pointer" :title="name" />
        {{ name }}
      </label>
    </div>

    <ClientOnly>
      <GraphView
        v-if="graph"
        ref="graphRef"
        :nodes="graph.nodes"
        :edges="graph.edges"
        :settings="settings"
      />
      <template #fallback>
        <div class="h-[70vh] flex items-center justify-center text-[var(--text-secondary)]">图谱加载中…</div>
      </template>
    </ClientOnly>
  </div>
</template>
