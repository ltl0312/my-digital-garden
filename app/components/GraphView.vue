<template>
  <div class="relative w-full h-full overflow-hidden bg-surface">
    <svg ref="svgRef" class="w-full h-full block"></svg>
  </div>
</template>

<script setup lang="ts">
// GraphCanvas（spec 5.5）：SVG 画布 + 变换（缩放/平移）+ 节点拖拽固定
// · 孤立节点轨道化（虚线描边 + 降透明度，成为可发现的入口）
// · 标签加 3px 描边底衬（paint-order），仅高度数节点常显
// · 力导向只「点火」后逐帧降温，收敛即停机；物理开关 = 重新点火
// · 高度数节点的弹簧力按端点度数归一化
import * as d3 from 'd3'

export interface GraphSettings {
  groupBy: 'domain' | 'maturity' | 'tag'
  colors: Record<string, string>
  sizeMode: 'fixed' | 'degree'
  nodeSize: number
}

interface GraphNode { id: string; title: string; slug: string; maturity: string; primaryTag: string | null; domain?: string }
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
  pos: Record<string, [number, number, number, number]>
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
// 链式调用（selectAll(...).data(...).join(...)）产出的 Selection 会带上 Element/BaseType
// 等额外类型参数，与本处声明的精确形状不一致；按本文件既有风格（d3.drag<any, any> 等）
// 收敛为 any，运行时语义不变。
let nodeSel: d3.Selection<any, any, any, any> | null = null
let zoom: d3.ZoomBehavior<any, any> | null = null
let canvasG: d3.Selection<SVGGElement, any, any, any> | null = null
let currentZoom: d3.ZoomTransform = d3.zoomIdentity
const size = { w: 800, h: 500 }

/** 最小可读缩放：窄屏 0.34，宽屏 0.2（spec 7 移动端） */
const minScale = () => (size.w < 768 ? 0.34 : 0.2)

onMounted(() => {
  if (!svgRef.value) return
  const svg = d3.select(svgRef.value)
  size.w = svgRef.value.clientWidth || 800
  size.h = svgRef.value.clientHeight || 500

  svg.selectAll('*').remove()

  const links = props.edges.map(e => ({ source: e.source, target: e.target }))
  const nodes: any[] = props.nodes.map(n => ({ ...n }))
  const g = svg.append('g')
  canvasG = g

  // 度数：决定半径、标签常显与弹簧归一化
  const degreeMap = new Map<string, number>()
  for (const l of links as any[]) {
    degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1)
    degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1)
  }
  for (const n of nodes) n.degree = degreeMap.get(n.id) || 0

  // 孤立节点轨道化：度为 0 的节点排在外围等距轨道上（固定位置，不参与收敛漂移）
  const isolated = nodes.filter(n => n.degree === 0)
  const orbitR = Math.max(size.w, size.h) * 0.42
  isolated.forEach((n, i) => {
    const a = (i / Math.max(1, isolated.length)) * Math.PI * 2 - Math.PI / 2
    n.x = size.w / 2 + Math.cos(a) * orbitR
    n.y = size.h / 2 + Math.sin(a) * orbitR
    n.fx = n.x
    n.fy = n.y
    n.isolated = true
  })

  // 恢复保存的节点位置（孤立节点始终由轨道决定，不覆盖）
  const saved = loadState()
  for (const n of nodes) {
    if (n.isolated) continue
    const p = saved?.pos?.[n.id]
    if (p) {
      n.x = p[0]
      n.y = p[1]
      n.fx = Number.isFinite(p[2]) ? p[2] : p[0]
      n.fy = Number.isFinite(p[3]) ? p[3] : p[1]
    }
  }

  const groupOf = (d: any) =>
    props.settings.groupBy === 'tag' ? (d.primaryTag || '未分类')
      : props.settings.groupBy === 'maturity' ? (d.maturity || 'SEEDLING')
        : (d.domain || '其他')

  const radiusOf = (d: any) =>
    props.settings.sizeMode === 'degree'
      ? Math.min(36, Math.max(11, 11 + (degreeMap.get(d.id) || 0) * 2))
      : props.settings.nodeSize

  const colorOf = (d: any) => props.settings.colors[groupOf(d)] || '#8C6D46'

  const simCenter = d3.forceCenter(size.w / 2, size.h / 2)

  simulation = d3.forceSimulation(nodes as any)
    .force('link', d3.forceLink(links as any)
      .id((d: any) => d.id)
      .distance(120)
      // 弹簧力按端点度数归一化：避免 MOC 等高连接节点被几十条边反复拉扯
      .strength((l: any) => 1 / Math.min(6, Math.max(1, Math.min(degreeMap.get(l.source?.id ?? l.source) || 1, degreeMap.get(l.target?.id ?? l.target) || 1)))))
    .force('charge', d3.forceManyBody().strength(-320))
    .force('center', simCenter)
    .force('collide', d3.forceCollide((d: any) => radiusOf(d) + 10))
    .alphaDecay(0.032)
    .velocityDecay(0.42)

  const link = g.append('g')
    .attr('stroke', 'var(--line)')
    .attr('stroke-width', 1.2)
    .selectAll('line')
    .data(links)
    .join('line')

  const persistState = () => {
    const pos: Record<string, [number, number, number, number]> = {}
    for (const n of simulation?.nodes() || []) {
      if (n.isolated) continue
      pos[n.id] = [n.x, n.y, n.fx ?? Number.NaN, n.fy ?? Number.NaN]
    }
    localStorage.setItem(STATE_KEY, JSON.stringify({
      pos,
      zoom: { x: currentZoom.x, y: currentZoom.y, k: currentZoom.k }
    }))
  }

  const nodeSelection = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .style('cursor', 'pointer')
    .call(d3.drag<any, any>()
      .on('start', (event, d) => {
        // 阻断冒泡，避免节点拖拽同时触发画布 zoom 平移
        event.sourceEvent.stopPropagation()
        if (d.isolated) return // 轨道节点不参与拖拽
        if (!event.active) simulation!.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        if (d.isolated) return
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (d.isolated) return
        if (!event.active) simulation!.alphaTarget(0)
        d.fx = d.x
        d.fy = d.y // 拖拽后固定位置（Obsidian 行为）
        persistState()
      })
    )
    .on('click', (_, d) => router.push(`/notes/${String(d.slug).split('/').map(encodeURIComponent).join('/')}`))
    // 双击解除固定（spec 5.5 交互保留）
    .on('dblclick', (event, d) => {
      event.stopPropagation()
      if (d.isolated) return
      d.fx = null
      d.fy = null
      simulation?.alpha(0.4).restart()
      persistState()
    })
    .on('mouseenter', function (_, d) {
      d3.select(this).select('text').attr('opacity', 1)
      d3.select(this).select('circle').attr('stroke-width', 3)
    })
    .on('mouseleave', function (_, d) {
      d3.select(this).select('text').attr('opacity', d.degree >= 4 ? 1 : 0)
      d3.select(this).select('circle').attr('stroke-width', d.isolated ? 1.5 : 2)
    })

  // 供 tick 回调与对外方法（resetLayout / focusNode）使用的跨函数引用
  nodeSel = nodeSelection

  nodeSelection.append('circle')
    .attr('r', radiusOf)
    .attr('fill', colorOf)
    .attr('fill-opacity', d => (d.isolated ? 0.45 : 1))
    .attr('stroke', d => (d.isolated ? 'var(--ink-3)' : 'var(--canvas)'))
    .attr('stroke-width', d => (d.isolated ? 1.5 : 2))
    .attr('stroke-dasharray', d => (d.isolated ? '3 3' : null))

  nodeSelection.append('title').text(d => `${d.title}${d.isolated ? '（尚未连接）' : ` · ${d.degree} 条连接`}`)

  // 标签：3px 描边底衬避免互相压叠；仅度数 ≥ 4 常显，其余悬停显示
  nodeSelection.append('text')
    .attr('dy', d => radiusOf(d) + 13)
    .attr('text-anchor', 'middle')
    .attr('font-size', 12)
    .attr('fill', 'var(--ink-2)')
    .attr('paint-order', 'stroke')
    .attr('stroke', 'var(--surface)')
    .attr('stroke-width', 3)
    .attr('stroke-linejoin', 'round')
    .attr('opacity', d => (d.degree >= 4 ? 1 : 0))
    .style('pointer-events', 'none')
    .text(d => (d.title.length > 14 ? `${d.title.slice(0, 14)}…` : d.title))

  // 标签置顶：把文字节点移到各自分组末尾
  nodeSelection.each(function () {
    const el = this as SVGGElement
    el.appendChild(el.querySelector('text') as SVGTextElement)
  })

  simulation.on('tick', () => {
    link
      .attr('x1', d => (d.source as any).x).attr('y1', d => (d.source as any).y)
      .attr('x2', d => (d.target as any).x).attr('y2', d => (d.target as any).y)
    nodeSel!.attr('transform', d => `translate(${d.x},${d.y})`)
  })

  // 收敛即停机（d3 在 alpha < alphaMin 时自动停止；此处同步开关状态）
  simulation.on('end', () => { physicsActive.value = false })

  // 画布缩放与平移：窄屏抬升最小缩放（spec 7：窄屏 0.34，以平移探索替代整图缩放）
  // 显式给出泛型：与下方 svg（Selection<SVGSVGElement, …>）的元素类型对齐，
  // 否则 d3.zoom() 推断出的 ZoomBehavior<Element, unknown> 与 call 的参数不匹配
  const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([minScale(), 4])
    .on('zoom', (event) => {
      currentZoom = event.transform
      g.attr('transform', event.transform)
    })
    .on('end', persistState)
  zoom = zoomBehavior
  svg.call(zoomBehavior)

  if (saved?.zoom) {
    currentZoom = d3.zoomIdentity.translate(saved.zoom.x, saved.zoom.y).scale(saved.zoom.k)
    svg.call(zoomBehavior.transform, currentZoom)
  }

  const onResize = () => {
    if (!svgRef.value) return
    size.w = svgRef.value.clientWidth || 800
    size.h = svgRef.value.clientHeight || 500
    // 断点跨越时同步缩放下限（窄屏 0.34 / 宽屏 0.2）
    if (zoom && svgRef.value) {
      const before = zoom.scaleExtent()[0]
      zoom.scaleExtent([minScale(), 4])
      if (before !== minScale()) d3.select(svgRef.value).call(zoom)
    }
    simCenter.x(size.w / 2).y(size.h / 2)
    simulation?.alpha(0.3).restart()
  }
  window.addEventListener('resize', onResize)
  window.addEventListener('beforeunload', persistState)

  onScopeDispose(() => {
    persistState()
    simulation?.stop()
    window.removeEventListener('resize', onResize)
    window.removeEventListener('beforeunload', persistState)
  })
})

// 设置变更（分组/颜色/大小）时就地更新样式，无需重启模拟
watch(() => props.settings, () => {
  if (!nodeSel) return
  const data = (nodeSel.data() || []) as any[]
  nodeSel.select('circle')
    .attr('r', (d: any) =>
      props.settings.sizeMode === 'degree'
        ? Math.min(36, Math.max(11, 11 + (d.degree || 0) * 2))
        : props.settings.nodeSize
    )
    .attr('fill', (d: any) => {
      const group = props.settings.groupBy === 'tag' ? (d.primaryTag || '未分类')
        : props.settings.groupBy === 'maturity' ? (d.maturity || 'SEEDLING')
          : (d.domain || '其他')
      return props.settings.colors[group] || '#8C6D46'
    })
  void data
}, { deep: true })

/** 重置布局：清空状态与固定位置，重新点火 */
const resetLayout = () => {
  localStorage.removeItem(STATE_KEY)
  if (simulation) {
    for (const n of simulation.nodes()) {
      if (n.isolated) continue
      n.fx = null
      n.fy = null
    }
    simulation.alpha(1).restart()
  }
  if (svgRef.value && zoom) {
    d3.select(svgRef.value).call(zoom.transform, d3.zoomIdentity)
    currentZoom = d3.zoomIdentity
  }
  physicsActive.value = true
}

/** 缩放到指定倍数（工具条 + / −） */
const zoomBy = (factor: number) => {
  if (!svgRef.value || !zoom) return
  d3.select(svgRef.value).transition().duration(220).call(zoom.scaleBy, factor)
}

/** 适配全图：按节点包围盒计算缩放与平移 */
const fitView = () => {
  if (!svgRef.value || !zoom || !simulation) return
  const pts = simulation.nodes().filter(n => Number.isFinite(n.x) && Number.isFinite(n.y))
  if (!pts.length) return
  const xs = pts.map(n => n.x); const ys = pts.map(n => n.y)
  const minX = Math.min(...xs); const maxX = Math.max(...xs)
  const minY = Math.min(...ys); const maxY = Math.max(...ys)
  const pad = 80
  const w = Math.max(1, maxX - minX); const h = Math.max(1, maxY - minY)
  const k = Math.max(0.2, Math.min(2.4, Math.min((size.w - pad * 2) / w, (size.h - pad * 2) / h)))
  const tx = size.w / 2 - k * ((minX + maxX) / 2)
  const ty = size.h / 2 - k * ((minY + maxY) / 2)
  const t = d3.zoomIdentity.translate(tx, ty).scale(k)
  d3.select(svgRef.value).transition().duration(320).call(zoom.transform, t)
  currentZoom = t
}

/** 定位到某篇笔记：居中放大并脉冲高亮 */
const focusNode = (slug: string) => {
  if (!svgRef.value || !zoom || !simulation) return false
  const target = simulation.nodes().find(n => n.slug === slug)
  if (!target) return false
  const k = 1.6
  const t = d3.zoomIdentity.translate(size.w / 2 - k * (target.x ?? size.w / 2), size.h / 2 - k * (target.y ?? size.h / 2)).scale(k)
  d3.select(svgRef.value).transition().duration(320).call(zoom.transform, t)
  currentZoom = t
  // 脉冲：临时放大描边
  if (nodeSel) {
    const hit = nodeSel.filter((d: any) => d.slug === slug)
    hit.select('text').attr('opacity', 1)
    hit.select('circle').transition().duration(200).attr('stroke-width', 5).attr('stroke', 'var(--accent)')
      .transition().duration(600).attr('stroke-width', (d: any) => (d.isolated ? 1.5 : 2)).attr('stroke', (d: any) => (d.isolated ? 'var(--ink-3)' : 'var(--canvas)'))
  }
  return true
}

// 物理模拟开关：与页面 v-model 双向同步（组件重挂载后页面状态仍一致）
const physicsActive = defineModel<boolean>('physicsActive', { default: true })
const togglePhysics = () => {
  physicsActive.value = !physicsActive.value
  if (physicsActive.value) {
    simulation?.alpha(0.6).restart()
  } else {
    simulation?.stop()
  }
}

defineExpose({ resetLayout, togglePhysics, zoomBy, fitView, focusNode })
</script>
