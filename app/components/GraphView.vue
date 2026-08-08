<template>
  <div class="rounded-2xl glass-card overflow-hidden">
    <svg ref="svgRef" class="w-full h-[70vh] block"></svg>
  </div>
</template>

<script setup lang="ts">
import * as d3 from 'd3'

export interface GraphSettings {
  groupBy: 'maturity' | 'tag'
  colors: Record<string, string>
  sizeMode: 'fixed' | 'degree'
  nodeSize: number
}

interface GraphNode { id: string; title: string; slug: string; maturity: string; primaryTag: string | null }
interface GraphEdge { source: string; target: string }

const props = defineProps<{
  nodes: GraphNode[]
  edges: GraphEdge[]
  settings: GraphSettings
}>()

const svgRef = ref<SVGSVGElement | null>(null)
const router = useRouter()

const STATE_KEY = 'garden-graph-state'

interface GraphState {
  pos: Record<string, [number, number, number, number]> // id -> [x, y, fx, fy]（未固定用 NaN）
  zoom: { x: number; y: number; k: number }
}

function loadState(): GraphState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

let simulation: d3.Simulation<any, any> | null = null
let nodeSel: d3.Selection<SVGGElement, any, any, any> | null = null
let zoom: d3.ZoomBehavior<SVGSVGElement, any> | null = null

onMounted(() => {
  if (!svgRef.value) return
  const svg = d3.select(svgRef.value)
  const width = svgRef.value.clientWidth || 800
  const height = svgRef.value.clientHeight || 500

  svg.selectAll('*').remove()

  const links = props.edges.map(e => ({ source: e.source, target: e.target }))
  const nodes = props.nodes.map(n => ({ ...n }))
  const g = svg.append('g')

  // 恢复保存的节点位置（fx/fy 固定，Obsidian 行为）
  const saved = loadState()
  for (const n of nodes as any[]) {
    const p = saved?.pos?.[n.id]
    if (p) {
      n.x = p[0]
      n.y = p[1]
      n.fx = Number.isFinite(p[2]) ? p[2] : p[0]
      n.fy = Number.isFinite(p[3]) ? p[3] : p[1]
    }
  }

  // 节点度数列（按链接数），用于 degree 大小模式
  const degreeMap = new Map<string, number>()
  for (const l of links as any[]) {
    degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1)
    degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1)
  }
  for (const n of nodes as any[]) {
    n.degree = degreeMap.get(n.id) || 0
  }

  const groupOf = (d: any) =>
    props.settings.groupBy === 'tag' ? (d.primaryTag || '未分类') : (d.maturity || 'SEEDLING')

  const radiusOf = (d: any) =>
    props.settings.sizeMode === 'degree'
      ? Math.min(36, Math.max(12, 12 + (degreeMap.get(d.id) || 0) * 2))
      : props.settings.nodeSize

  const colorOf = (d: any) => props.settings.colors[groupOf(d)] || '#8C6D46'

  simulation = d3.forceSimulation(nodes as any)
    .force('link', d3.forceLink(links as any).id((d: any) => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(40))

  const link = g.append('g')
    .attr('stroke', 'var(--border-color)')
    .attr('stroke-width', 1.5)
    .selectAll('line')
    .data(links)
    .join('line')

  let currentZoom: d3.ZoomTransform = d3.zoomIdentity
  const persistState = () => {
    const pos: Record<string, [number, number, number, number]> = {}
    for (const n of simulation?.nodes() || []) {
      pos[n.id] = [n.x, n.y, n.fx ?? Number.NaN, n.fy ?? Number.NaN]
    }
    localStorage.setItem(STATE_KEY, JSON.stringify({
      pos,
      zoom: { x: currentZoom.x, y: currentZoom.y, k: currentZoom.k }
    }))
  }

  nodeSel = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .style('cursor', 'pointer')
    .call(d3.drag<any, any>()
      .on('start', (event, d) => {
        // 阻断冒泡，避免节点拖拽同时触发画布 zoom 平移
        event.sourceEvent.stopPropagation()
        if (!event.active) simulation!.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation!.alphaTarget(0)
        d.fx = d.x
        d.fy = d.y // 拖拽后固定位置（Obsidian 行为）
        persistState()
      })
    )
    .on('click', (_, d) => router.push(`/notes/${d.slug}`))

  nodeSel.append('circle')
    .attr('r', radiusOf)
    .attr('fill', colorOf)
    .attr('stroke', 'var(--bg-primary)')
    .attr('stroke-width', 2)

  nodeSel.append('text')
    .attr('dy', 34)
    .attr('text-anchor', 'middle')
    .attr('font-size', 12)
    .attr('fill', 'var(--text-primary)')
    .text(d => d.title.length > 14 ? `${d.title.slice(0, 14)}…` : d.title)

  nodeSel.append('title').text(d => d.title)

  simulation.on('tick', () => {
    link
      .attr('x1', d => (d.source as any).x).attr('y1', d => (d.source as any).y)
      .attr('x2', d => (d.target as any).x).attr('y2', d => (d.target as any).y)
    nodeSel!.attr('transform', d => `translate(${d.x},${d.y})`)
  })

  // 画布缩放（0.2x-4x）与平移
  zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => {
      currentZoom = event.transform
      g.attr('transform', event.transform)
    })
    .on('end', persistState)
  svg.call(zoom)

  // 恢复保存的缩放状态
  if (saved?.zoom) {
    currentZoom = d3.zoomIdentity.translate(saved.zoom.x, saved.zoom.y).scale(saved.zoom.k)
    svg.call(zoom.transform, currentZoom)
  }

  window.addEventListener('beforeunload', persistState)

  onScopeDispose(() => {
    persistState()
    simulation?.stop()
    window.removeEventListener('beforeunload', persistState)
  })
})

// 设置变更（分组/颜色/大小）时就地更新节点样式，无需重启模拟
watch(() => props.settings, () => {
  if (!nodeSel) return
  const degreeMap = new Map<string, number>()
  for (const n of (nodeSel.data() || []) as any[]) {
    degreeMap.set(n.id, n.degree || 0)
  }
  nodeSel.select('circle')
    .attr('r', (d: any) =>
      props.settings.sizeMode === 'degree'
        ? Math.min(36, Math.max(12, 12 + (degreeMap.get(d.id) || 0) * 2))
        : props.settings.nodeSize
    )
    .attr('fill', (d: any) => {
      const group = props.settings.groupBy === 'tag' ? (d.primaryTag || '未分类') : (d.maturity || 'SEEDLING')
      return props.settings.colors[group] || '#8C6D46'
    })
}, { deep: true })

// 重置布局：清空状态与固定位置，重新模拟
const resetLayout = () => {
  localStorage.removeItem(STATE_KEY)
  if (simulation) {
    for (const n of simulation.nodes()) {
      n.fx = null
      n.fy = null
    }
    simulation.alpha(1).restart()
  }
  if (svgRef.value && zoom) {
    d3.select(svgRef.value).call(zoom.transform, d3.zoomIdentity)
  }
}

// 物理模拟开关（ui.md 浮动控件）
const isPhysicsActive = ref(true)
const togglePhysics = () => {
  isPhysicsActive.value = !isPhysicsActive.value
  if (isPhysicsActive.value) {
    simulation?.alpha(0.5).restart()
  } else {
    simulation?.stop()
  }
}

defineExpose({ resetLayout, togglePhysics, isPhysicsActive })
</script>
