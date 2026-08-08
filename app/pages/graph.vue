<script setup lang="ts">
import { Network, Maximize2, Zap, Settings2 } from 'lucide-vue-next'

interface GraphSettings {
  groupBy: 'maturity' | 'tag'
  colors: Record<string, string>
  sizeMode: 'fixed' | 'degree'
  nodeSize: number
}

const SETTINGS_KEY = 'garden-graph-settings'
// Lumina 三色（ui.md）：seedling 紫 / growing 天蓝 / evergreen 翠绿
const DEFAULT_COLORS: Record<string, string> = {
  SEEDLING: '#9333ea',
  GROWING: '#0284c7',
  EVERGREEN: '#16a34a'
}
const TAG_PALETTE = ['#16a34a', '#0284c7', '#9333ea', '#8C6D46', '#B87A8C', '#7A8CB8', '#8CB05B', '#B8A05B']

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

const showSettings = ref(false)

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
const togglePhysics = () => graphRef.value?.togglePhysics()
const physicsActive = ref(true)

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
  <div class="max-w-6xl mx-auto px-4 py-6">
    <!-- 图谱 Info 条 -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center space-x-2 glass-card px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300">
        <Network class="w-4 h-4 text-garden-600 dark:text-garden-400 animate-pulse" />
        <span class="font-semibold">Interactive Garden Graph</span>
        <span class="text-[10px] bg-slate-200 dark:bg-white/10 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400 font-mono">{{ graph?.nodes?.length || 0 }} Nodes</span>
      </div>
      <div class="flex items-center space-x-1 glass-card p-1 rounded-xl">
        <button
          class="p-2 hover:bg-slate-200/60 dark:hover:bg-white/10 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
          title="Center View"
          @click="resetLayout"
        >
          <Maximize2 class="w-4 h-4" />
        </button>
        <button
          class="p-2 hover:bg-slate-200/60 dark:hover:bg-white/10 rounded-lg transition-colors"
          :class="physicsActive ? 'text-garden-600 dark:text-garden-400' : 'text-slate-400 dark:text-slate-500'"
          title="Toggle Physics"
          @click="physicsActive = !physicsActive; togglePhysics()"
        >
          <Zap class="w-4 h-4" />
        </button>
        <button
          class="p-2 hover:bg-slate-200/60 dark:hover:bg-white/10 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
          title="Graph Settings"
          @click="showSettings = !showSettings"
        >
          <Settings2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="glass-card rounded-2xl p-4 mb-4 space-y-3">
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          着色
          <select v-model="settings.groupBy" class="px-2 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-white/10 outline-none focus:border-garden-500/60">
            <option value="maturity">按成熟度</option>
            <option value="tag">按标签</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          大小
          <select v-model="settings.sizeMode" class="px-2 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-obsidian-800 border border-slate-200 dark:border-white/10 outline-none focus:border-garden-500/60">
            <option value="degree">按链接数</option>
            <option value="fixed">固定</option>
          </select>
        </label>
        <label v-if="settings.sizeMode === 'fixed'" class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          节点大小
          <input v-model.number="settings.nodeSize" type="range" min="10" max="40" class="w-28" />
          <span>{{ settings.nodeSize }}</span>
        </label>
      </div>
      <div v-if="legendGroups.length" class="flex flex-wrap gap-3">
        <label
          v-for="[name, color] in legendGroups"
          :key="name"
          class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"
        >
          <input v-model="settings.colors[name]" type="color" class="w-5 h-5 rounded cursor-pointer" :title="name" />
          {{ name }}
        </label>
      </div>
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
        <div class="h-[70vh] flex items-center justify-center text-slate-400">图谱加载中…</div>
      </template>
    </ClientOnly>
  </div>
</template>
