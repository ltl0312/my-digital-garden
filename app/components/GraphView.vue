<template>
  <div
    ref="hostRef"
    class="graph-host relative w-full h-full overflow-hidden bg-surface outline-none"
    :class="pickingPath ? 'cursor-crosshair' : ''"
    tabindex="0"
    role="application"
    :aria-label="`知识图谱，共 ${nodes.length} 个节点`"
    data-testid="graph-canvas"
    :data-graph-ready="ready ? '1' : '0'"
    :data-zoom="zoomK"
    @keydown="onKeydown"
    @pointerdown="onPointerDownCapture"
  >
    <!-- Canvas 分级（>150 节点）：连线与节点画在 canvas 上 -->
    <canvas v-show="tier === 'canvas'" ref="canvasRef" class="absolute inset-0 w-full h-full" aria-hidden="true"></canvas>

    <!-- SVG 层：svg 分级负责全部可见绘制；canvas 分级只保留不可见的命中区域 -->
    <svg ref="svgRef" class="absolute inset-0 w-full h-full block">
      <g ref="viewportRef">
        <g ref="linkLayerRef"></g>
        <g ref="nodeLayerRef"></g>
      </g>
    </svg>

    <!-- canvas 分级的标签层（绝对定位 DOM，不参与命中） -->
    <div v-show="tier === 'canvas'" ref="labelLayerRef" class="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true"></div>

    <!-- 悬停信息卡：自动避让边界 + pointer-events:none -->
    <div
      v-if="hoverCard"
      role="tooltip"
      class="absolute z-30 pointer-events-none max-w-[240px] rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds2 px-2.5 py-1.5"
      :style="{ left: hoverCard.x + 'px', top: hoverCard.y + 'px' }"
    >
      <p class="text-[12px] font-semibold text-ink truncate">{{ hoverCard.title }}</p>
      <p class="mt-0.5 text-[12px] text-ink-2 flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: hoverCard.color }"></span>
        <span class="truncate">{{ hoverCard.domain }}</span>
        <span class="font-mono text-ink-3 tabular-nums">{{ hoverCard.degree }}</span>
      </p>
    </div>

    <!-- 固定提示条（画布左上，amber） -->
    <div
      v-if="pinnedCount > 0"
      class="absolute left-3 top-14 z-20 flex items-center gap-1.5 rounded-ctl border border-[var(--hue-32)]/40 bg-[var(--hue-32)]/12 px-2.5 py-1 text-[12px] text-ink-2 backdrop-blur"
      data-testid="graph-pin-hint"
    >
      <span class="w-2 h-2 rounded-full bg-[var(--hue-32)] shrink-0"></span>
      <span>{{ pinnedCount }} 个节点已固定 · 双击解除</span>
    </div>

    <!-- 渲染状态（A12：FPS / 节点边数 / 首帧耗时 常驻可见） -->
    <div
      class="absolute left-3 bottom-3 z-10 rounded-ctl border border-line bg-surface/90 backdrop-blur px-2 py-1 font-mono text-[11px] text-ink-3 tabular-nums flex items-center gap-2 max-[639px]:bottom-[60px]"
      data-testid="graph-perf"
    >
      <span :class="fps >= 55 ? 'text-ink-2' : 'text-ink-3'" data-testid="graph-fps">{{ fps }} FPS</span>
      <span class="text-line">|</span>
      <span>{{ drawnCount }}/{{ nodes.length }} 节点</span>
      <span class="text-line">|</span>
      <span>{{ edges.length }} 连接</span>
      <span class="text-line">|</span>
      <span>首帧 {{ firstPaintMs }}ms</span>
      <span class="text-line">|</span>
      <span>{{ tier === 'svg' ? 'SVG' : 'Canvas' }}</span>
    </div>

    <!-- 路径选点提示 -->
    <div
      v-if="pickingPath"
      class="absolute left-1/2 -translate-x-1/2 top-16 z-20 rounded-ctl border border-line bg-surface/95 backdrop-blur shadow-ds1 px-3 py-1.5 text-[12px] text-ink-2"
    >
      依次点选两个节点，查找最短路径
    </div>

    <p class="sr-only" aria-live="polite">{{ liveMessage }}</p>
  </div>
</template>

<script setup lang="ts">
// GraphCanvas（计划书 T1.2 / T2.5 / T3.1 / T3.4 / T4.2）
// · 渲染分级：≤150 节点走 SVG，>150 走 Canvas，>600 只画度数 Top 200
// · 交互：单击选中、双击进正文、拖拽固定、空白单击清选
// · 邻域聚焦：邻域内描边 2.5px、邻域外 0.12 不透明度、邻域内连线 2.4px
// · 布局：force 由 d3 力仿真接手，tree/radial/timeline 由 computeLayout 纯函数算完再 400ms 补间
import * as d3 from 'd3'
import type { GraphEdge, GraphNode, LayoutName } from '~/lib/graph-types'
import {
  DRAG_CLICK_THRESHOLD_PX,
  EDGE_STYLE,
  FOCUS_STYLE,
  LAYOUT_TRANSITION_MS,
  MATURITY_COLORS,
  PIN_DOT_RADIUS,
  RENDER_TIERS,
  TOUCH_HIT_RADIUS,
  ZOOM
} from '~/lib/graph-constants'
import { FORCE_PARAMS, computeLayout } from '~/lib/graphLayouts'
import { patchGraphState, readGraphState } from '~/lib/graphState'
import { domainColor } from '#shared/graph-domain'

/** 页面可附带 degree / isolated（缺省时由边就地推算） */
export type GraphNodeProp = GraphNode & { degree?: number; isolated?: boolean }

interface VNode {
  id: string
  title: string
  slug: string
  domain: string
  maturity: string
  tags: string[]
  dirPath: string
  updatedAt: string | null
  inDegree: number
  degree: number
  isolated: boolean
  x: number
  y: number
  fx: number | null
  fy: number | null
  r: number
  color: string
  pinned: boolean
}

interface VLink {
  source: string
  target: string
  kind: string
}

const props = defineProps<{
  nodes: GraphNodeProp[]
  edges: GraphEdge[]
  selectedId: string | null
  /** 邻域聚焦集合（含自身）；null = 不聚焦 */
  focusIds: string[] | null
  layout: LayoutName
  showLabels: boolean
  pickingPath: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedId', v: string | null): void
  (e: 'open', slug: string): void
  (e: 'pick', id: string): void
  (e: 'ready'): void
}>()

const physicsActive = defineModel<boolean>('physicsActive', { default: true })

const hostRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const labelLayerRef = ref<HTMLDivElement | null>(null)
const viewportRef = ref<SVGGElement | null>(null)
const linkLayerRef = ref<SVGGElement | null>(null)
const nodeLayerRef = ref<SVGGElement | null>(null)

const ready = ref(false)
const zoomK = ref('1.000')
const fps = ref(0)
const firstPaintMs = ref(0)
const pinnedCount = ref(0)
const converged = ref(false)
const liveMessage = ref('')
const hoverCard = ref<{ x: number; y: number; title: string; domain: string; color: string; degree: number } | null>(null)

/** 分级：≤150 SVG，其余 Canvas（>600 再收敛到 Top 200） */
const tier = computed<'svg' | 'canvas'>(() => (props.nodes.length <= RENDER_TIERS.svg ? 'svg' : 'canvas'))

const localDegree = computed(() => {
  const m = new Map<string, number>()
  for (const e of props.edges) {
    m.set(e.source, (m.get(e.source) || 0) + 1)
    m.set(e.target, (m.get(e.target) || 0) + 1)
  }
  return m
})

/** 实际绘制的节点：>600 只保留度数 Top 200 */
const drawnIds = computed<Set<string> | null>(() => {
  if (tier.value !== 'canvas' || props.nodes.length <= RENDER_TIERS.canvas) return null
  const sorted = [...props.nodes].sort((a, b) =>
    (b.degree ?? localDegree.value.get(b.id) ?? 0) - (a.degree ?? localDegree.value.get(a.id) ?? 0)
  )
  return new Set(sorted.slice(0, RENDER_TIERS.topN).map(n => n.id))
})

const drawnCount = computed(() => drawnIds.value ? drawnIds.value.size : props.nodes.length)

// ---------- 非响应式的运行时状态（每帧都在变，走 Vue 响应式会拖慢渲染） ----------
let nodeData: VNode[] = []
let nodeMap = new Map<string, VNode>()
let linkData: VLink[] = []
let simulation: any = null
let nodeSel: any = null
let linkSel: any = null
let zoomBehavior: any = null
let currentZoom: d3.ZoomTransform = d3.zoomIdentity
let size = { w: 800, h: 500 }
let suppressClick = false
let dragMoved = 0
// 拖拽开始时节点是否已经处于固定状态（孤立节点的轨道位置、此前被拖拽过的节点）。
// 用于区分「这一次拖拽真的移动了」和「只是单击」——单击绝不能把节点钉住，
// 否则紧随其后的双击会被判成「解除固定」而不是「打开笔记」。
let dragWasPinned = false
let zoomMoved = 0
let dragging = false
let touchMode = false
let clickTimer: number | null = null
let tweenRaf: number | null = null
let fpsRaf: number | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let mountAt = 0
let painted = false
type GraphCssVar = 'line' | 'surface' | 'ink2' | 'ink3' | 'accent' | 'canvas'
// 用有限键的映射类型而非 Record<string,string>：后者在 noUncheckedIndexedAccess 下
// 每次取值都是 `string | undefined`，无法直接赋给 canvas 的 fillStyle/strokeStyle。
let cssVars: Record<GraphCssVar, string> = {
  line: '#E6E3D9',
  surface: '#FFFFFF',
  ink2: '#4C545F',
  ink3: '#7B838F',
  accent: '#0E7C5A',
  canvas: '#F5F4EF'
}

const isTouchNow = () => (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) || touchMode

/** 最小可读缩放：窄屏 0.34，宽屏 0.2（沿用既有契约；768 是画布宽度阈值，不等于 BP） */
const minScale = () => (size.w < ZOOM.narrowCanvasWidth ? ZOOM.minNarrow : ZOOM.minWide)

const focusSet = computed(() => (props.focusIds && props.focusIds.length ? new Set(props.focusIds) : null))

const radiusOf = (degree: number, isolated: boolean) => {
  if (isolated) return 9
  return Math.min(36, Math.max(11, 11 + degree * 2))
}

const colorOf = (n: { domain: string; maturity: string }) =>
  n.domain ? domainColor(n.domain) : (MATURITY_COLORS[n.maturity] || '#8C6D46')

const hitRadiusOf = (n: VNode) => (isTouchNow() ? TOUCH_HIT_RADIUS : Math.max(14, n.r + 6))

// ---------- 主题变量（canvas 绘制用） ----------
function refreshCssVars() {
  if (typeof document === 'undefined') return
  const cs = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) => (cs.getPropertyValue(name).trim() || fallback)
  cssVars = {
    line: pick('--line', '#E6E3D9'),
    surface: pick('--surface', '#FFFFFF'),
    ink2: pick('--ink-2', '#4C545F'),
    ink3: pick('--ink-3', '#7B838F'),
    accent: pick('--accent', '#0E7C5A'),
    canvas: pick('--canvas', '#F5F4EF')
  }
}

// ---------- 坐标与状态持久化 ----------
function seedPosition(id: string, saved: Record<string, [number, number, number, number]> | undefined, i: number, total: number): [number, number] {
  const p = saved?.[id]
  if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) return [p[0], p[1]]
  const t = (i + 1) * 2.399963229728653
  const r = Math.min(size.w, size.h) * FORCE_PARAMS.seedRadius * Math.sqrt((i + 1) / Math.max(1, total))
  return [size.w / 2 + r * Math.cos(t), size.h / 2 + r * Math.sin(t)]
}

function persist() {
  const pos: Record<string, [number, number, number, number]> = {}
  const pinned: string[] = []
  for (const n of nodeData) {
    pos[n.id] = [n.x, n.y, n.fx ?? Number.NaN, n.fy ?? Number.NaN]
    if (n.fx != null && n.fy != null) pinned.push(n.id)
  }
  pinnedCount.value = pinned.length
  patchGraphState({ pos, pinned, zoom: { x: currentZoom.x, y: currentZoom.y, k: currentZoom.k } })
}

// ---------- 渲染 ----------
function render() {
  if (!nodeSel) return
  if (tier.value === 'svg' && linkSel) {
    linkSel
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)
  }
  nodeSel.attr('transform', (d: VNode) => `translate(${d.x},${d.y})`)
  if (tier.value === 'canvas') {
    drawCanvas()
    positionLabels()
  }
  if (!painted) {
    painted = true
    firstPaintMs.value = Math.round(performance.now() - mountAt)
    ready.value = true
    emit('ready')
  }
}

function drawCanvas() {
  const cv = canvasRef.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const w = Math.max(1, size.w)
  const h = Math.max(1, size.h)
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
  }
  const k = currentZoom.k
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cv.width, cv.height)
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * currentZoom.x, dpr * currentZoom.y)
  ctx.lineCap = 'round'

  const focus = focusSet.value
  const drawn = drawnIds.value
  const inDraw = (id: string) => !drawn || drawn.has(id)

  // 连线
  ctx.lineWidth = EDGE_STYLE.baseWidth / k
  for (const l of linkData) {
    const s = nodeMap.get(l.source)
    const t = nodeMap.get(l.target)
    if (!s || !t || !inDraw(s.id) || !inDraw(t.id)) continue
    const hot = !focus || (focus.has(s.id) && focus.has(t.id))
    ctx.globalAlpha = hot ? 0.9 : EDGE_STYLE.dimOpacity
    ctx.strokeStyle = l.kind === 'tag' ? cssVars.ink3 : cssVars.line
    ctx.lineWidth = (hot && focus ? EDGE_STYLE.focusWidth : EDGE_STYLE.baseWidth) / k
    if (l.kind === 'tag') ctx.setLineDash([4 / k, 4 / k])
    else ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // 节点
  for (const n of nodeData) {
    if (!inDraw(n.id)) continue
    const hot = !focus || focus.has(n.id)
    ctx.globalAlpha = n.isolated ? (hot ? 0.45 : EDGE_STYLE.dimOpacity) : (hot ? 1 : EDGE_STYLE.dimOpacity)
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    ctx.fillStyle = n.color
    ctx.fill()
    ctx.lineWidth = (hot && focus && n.id === props.selectedId ? FOCUS_STYLE.nodeStrokeWidth : FOCUS_STYLE.nodeBaseStrokeWidth) / k
    ctx.strokeStyle = n.isolated ? cssVars.ink3 : cssVars.canvas
    if (n.isolated) ctx.setLineDash([3 / k, 3 / k])
    else ctx.setLineDash([])
    ctx.stroke()
    ctx.setLineDash([])
    if (n.fx != null && n.fy != null) {
      ctx.globalAlpha = hot ? 1 : EDGE_STYLE.dimOpacity
      ctx.beginPath()
      ctx.arc(n.x + n.r * 0.72, n.y - n.r * 0.72, PIN_DOT_RADIUS / 2, 0, Math.PI * 2)
      ctx.fillStyle = '#D08A2C'
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1

  // 标签（屏幕空间绘制，字号不随缩放变化，带描边底衬）
  const shown = labelsToShow()
  if (shown.length) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineWidth = 3
    ctx.strokeStyle = cssVars.surface
    ctx.lineJoin = 'round'
    for (const n of shown) {
      const sx = n.x * k + currentZoom.x
      const sy = (n.y + n.r) * k + currentZoom.y + 4
      ctx.strokeText(n.labelText, sx, sy)
      ctx.fillStyle = cssVars.ink2
      ctx.fillText(n.labelText, sx, sy)
    }
  }
}

type LabelNode = VNode & { labelText: string }

function labelsToShow(): LabelNode[] {
  const focus = focusSet.value
  const out: LabelNode[] = []
  for (const n of nodeData) {
    const hot = !focus || focus.has(n.id)
    if (!hot) continue
    const isSelected = n.id === props.selectedId
    const isHovered = hoverCard.value?.title === n.title
    if (!(props.showLabels && n.degree >= 4) && !isSelected && !isHovered) continue
    out.push(Object.assign(n, { labelText: n.title.length > 14 ? `${n.title.slice(0, 14)}…` : n.title }))
    if (out.length >= 160) break
  }
  return out
}

function positionLabels() {
  const layer = labelLayerRef.value
  if (!layer) return
  const shown = labelsToShow()
  const k = currentZoom.k
  while (layer.childElementCount < shown.length) {
    const el = document.createElement('div')
    el.className = 'graph-label'
    layer.appendChild(el)
  }
  const kids = layer.children
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i] as HTMLDivElement
    const n = shown[i]
    if (!n) {
      el.style.display = 'none'
      continue
    }
    el.style.display = ''
    if (el.textContent !== n.labelText) el.textContent = n.labelText
    const sx = n.x * k + currentZoom.x
    const sy = (n.y + n.r) * k + currentZoom.y + 4
    el.style.transform = `translate(${sx}px, ${sy}px) translateX(-50%)`
  }
}

// ---------- 图层构建 ----------
function buildLayers() {
  const drawn = drawnIds.value
  const visibleNodes = drawn ? nodeData.filter(n => drawn.has(n.id)) : nodeData
  const drawnSet = drawn
  linkData = props.edges
    .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target)
      && (!drawnSet || (drawnSet.has(e.source) && drawnSet.has(e.target))))
    .map(e => ({ source: e.source, target: e.target, kind: e.kind }))

  if (tier.value === 'svg') {
    linkSel = d3.select(linkLayerRef.value)
      .selectAll('line')
      .data(linkData, (d: any) => `${d.source}|${d.target}`)
      .join('line')
      .attr('stroke', (d: VLink) => (d.kind === 'tag' ? 'var(--ink-3)' : 'var(--line)'))
      .attr('stroke-width', EDGE_STYLE.baseWidth)
      .attr('stroke-dasharray', (d: VLink) => (d.kind === 'tag' ? '4 4' : null))
      .style('transition', `opacity ${EDGE_STYLE.dimTransitionMs}ms ease`)
  } else {
    d3.select(linkLayerRef.value).selectAll('*').remove()
    linkSel = null
  }

  const focus = focusSet.value
  nodeSel = d3.select(nodeLayerRef.value)
    .selectAll('g.gnode')
    .data(visibleNodes, (d: any) => d.id)
    .join(
      enter => {
        const g = enter.append('g').attr('class', 'gnode')
        g.append('circle').attr('class', 'gnode-hit')
        g.append('circle').attr('class', 'gnode-dot')
        g.append('circle').attr('class', 'gnode-pin')
        g.append('text').attr('class', 'gnode-label')
        return g
      },
      update => update,
      exit => exit.remove()
    )
    .style('cursor', 'pointer')

  nodeSel.select('circle.gnode-hit')
    .attr('r', (d: VNode) => hitRadiusOf(d))
    .attr('fill', 'transparent')
    .attr('stroke', 'none')
    .style('pointer-events', 'all')

  if (tier.value === 'svg') {
    nodeSel.select('circle.gnode-dot')
      .attr('r', (d: VNode) => d.r)
      .attr('fill', (d: VNode) => d.color)
      .attr('stroke', (d: VNode) => (d.isolated ? 'var(--ink-3)' : 'var(--canvas)'))
      .attr('stroke-width', (d: VNode) => (d.isolated ? FOCUS_STYLE.isolatedStrokeWidth : FOCUS_STYLE.nodeBaseStrokeWidth))
      .attr('stroke-dasharray', (d: VNode) => (d.isolated ? '3 3' : null))
      .attr('opacity', (d: VNode) => {
        if (d.isolated) return focus && !focus.has(d.id) ? EDGE_STYLE.dimOpacity : 0.45
        return focus && !focus.has(d.id) ? EDGE_STYLE.dimOpacity : 1
      })
      .style('transition', `opacity ${EDGE_STYLE.dimTransitionMs}ms ease`)

    nodeSel.select('text.gnode-label')
      .attr('dy', (d: VNode) => d.r + 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', 'var(--ink-2)')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'var(--surface)')
      .attr('stroke-width', 3)
      .attr('stroke-linejoin', 'round')
      .attr('opacity', (d: VNode) => {
        const hot = !focus || focus.has(d.id)
        if (!hot) return 0
        if (d.id === props.selectedId) return 1
        return props.showLabels && d.degree >= 4 ? 1 : 0
      })
      .style('pointer-events', 'none')
      .text((d: VNode) => (d.title.length > 14 ? `${d.title.slice(0, 14)}…` : d.title))

    nodeSel.select('text.gnode-label').raise()
  } else {
    nodeSel.select('circle.gnode-dot').attr('r', 0).attr('fill', 'transparent').attr('stroke', 'none')
    nodeSel.select('text.gnode-label').attr('opacity', 0)
  }

  nodeSel.select('circle.gnode-pin')
    .attr('r', PIN_DOT_RADIUS / 2)
    .attr('fill', '#D08A2C')
    .attr('stroke', 'var(--surface)')
    .attr('stroke-width', 1.5)
    .attr('transform', (d: VNode) => `translate(${d.r * 0.72},${-d.r * 0.72})`)
    .attr('opacity', (d: VNode) => (d.fx != null && d.fy != null ? 1 : 0))
    .style('pointer-events', 'none')

  nodeSel.select('title').remove()
  nodeSel.append('title').text((d: VNode) => `${d.title}${d.isolated ? '（尚未连接）' : ` · ${d.degree} 条连接`}`)

  attachInteraction()
}

function attachInteraction() {
  nodeSel
    .call(d3.drag<any, VNode>()
      .subject((_event: any, d: VNode) => ({ x: d.x, y: d.y }))
      .on('start', (event: any, d: VNode) => {
        event.sourceEvent?.stopPropagation?.()
        dragMoved = 0
        dragging = true
        dragWasPinned = d.fx != null && d.fy != null
        if (!event.active && simulation && physicsActive.value) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event: any, d: VNode) => {
        dragMoved += Math.abs(event.dx) + Math.abs(event.dy)
        d.fx = event.x
        d.fy = event.y
        d.x = event.x
        d.y = event.y
        if (tier.value === 'svg') render()
      })
      .on('end', (event: any, d: VNode) => {
        dragging = false
        if (!event.active && simulation && physicsActive.value) simulation.alphaTarget(0)
        const moved = dragMoved > DRAG_CLICK_THRESHOLD_PX
        if (moved || dragWasPinned) {
          d.fx = event.x
          d.fy = event.y
          d.pinned = true
        } else {
          d.fx = null
          d.fy = null
          d.pinned = false
        }
        suppressClick = moved
        persist()
        if (tier.value === 'svg') render()
      })
    )
    .on('click', (event: any, d: VNode) => {
      event.stopPropagation()
      if (suppressClick) {
        suppressClick = false
        return
      }
      if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
        return
      }
      clickTimer = window.setTimeout(() => {
        clickTimer = null
        if (props.pickingPath) emit('pick', d.id)
        else emit('update:selectedId', d.id)
      }, 200)
    })
    .on('dblclick', (event: any, d: VNode) => {
      event.stopPropagation()
      if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
      }
      if (d.fx != null && d.fy != null) {
        d.fx = null
        d.fy = null
        d.pinned = false
        simulation?.alpha(0.4).restart()
        persist()
        if (tier.value === 'svg') render()
        liveMessage.value = `已解除「${d.title}」的固定`
      } else {
        emit('open', d.slug)
      }
    })
    .on('mouseenter', (event: any, d: VNode) => {
      hoverCard.value = hoverAt(d, event)
      if (tier.value === 'svg') {
        d3.select(event.currentTarget).select('circle.gnode-dot').attr('stroke-width', FOCUS_STYLE.nodeStrokeWidth)
        d3.select(event.currentTarget).select('text.gnode-label').attr('opacity', 1)
      }
    })
    .on('mouseleave', (event: any, d: VNode) => {
      hoverCard.value = null
      if (tier.value === 'svg') {
        const focus = focusSet.value
        d3.select(event.currentTarget).select('circle.gnode-dot')
          .attr('stroke-width', d.isolated ? FOCUS_STYLE.isolatedStrokeWidth : FOCUS_STYLE.nodeBaseStrokeWidth)
        d3.select(event.currentTarget).select('text.gnode-label')
          .attr('opacity', props.showLabels && d.degree >= 4 && (!focus || focus.has(d.id)) ? 1 : 0)
      }
    })
}

/** 信息卡自动避让边界：右侧/下方放不下就翻到另一侧 */
function hoverAt(d: VNode, event: any) {
  const host = hostRef.value
  const rect = host?.getBoundingClientRect()
  const src = event?.clientX != null ? { x: event.clientX, y: event.clientY } : null
  const localX = src && rect ? src.x - rect.left : d.x * currentZoom.k + currentZoom.x
  const localY = src && rect ? src.y - rect.top : d.y * currentZoom.k + currentZoom.y
  const w = rect?.width ?? size.w
  const h = rect?.height ?? size.h
  const cardW = 248
  const cardH = 62
  let x = localX + 14
  let y = localY + 14
  if (x + cardW > w - 8) x = Math.max(8, localX - cardW - 14)
  if (y + cardH > h - 8) y = Math.max(8, localY - cardH - 14)
  return { x, y, title: d.title, domain: d.domain, color: d.color, degree: d.degree }
}

// ---------- 数据同步 ----------
function syncGraph() {
  const saved = readGraphState().pos
  const prevMap = nodeMap
  const next: VNode[] = []
  const total = props.nodes.length
  props.nodes.forEach((p, i) => {
    const degree = p.degree ?? localDegree.value.get(p.id) ?? 0
    const isolated = p.isolated ?? degree === 0
    const old = prevMap.get(p.id)
    const r = radiusOf(degree, isolated)
    const color = colorOf(p)
    if (old) {
      old.title = p.title
      old.slug = p.slug
      old.domain = p.domain
      old.maturity = p.maturity
      old.tags = p.tags
      old.dirPath = p.dirPath
      old.updatedAt = p.updatedAt
      old.inDegree = p.inDegree
      old.degree = degree
      old.isolated = isolated
      old.r = r
      old.color = color
      next.push(old)
      return
    }
    const [x, y] = seedPosition(p.id, saved, i, total)
    const pin = saved?.[p.id]
    const pinned = !!pin && Number.isFinite(pin[2]) && Number.isFinite(pin[3])
    next.push({
      id: p.id,
      title: p.title,
      slug: p.slug,
      domain: p.domain,
      maturity: p.maturity,
      tags: p.tags || [],
      dirPath: p.dirPath || '',
      updatedAt: p.updatedAt ?? null,
      inDegree: p.inDegree ?? 0,
      degree,
      isolated,
      x,
      y,
      fx: pinned ? pin![2] : null,
      fy: pinned ? pin![3] : null,
      r,
      color,
      pinned
    })
  })
  nodeData = next
  nodeMap = new Map(next.map(n => [n.id, n]))
  pinnedCount.value = next.filter(n => n.fx != null && n.fy != null).length

  buildLayers()
  syncSimulation()
  render()
}

function restartSimulation() {
  if (!simulation) return
  simulation.nodes(nodeData)
  const linkForce = simulation.force('link')
  if (linkForce) {
    linkForce.links(linkData)
    linkForce.id((d: any) => d.id)
  }
  const center = simulation.force('center')
  if (center) center.x(size.w / 2).y(size.h / 2)
  converged.value = false
  simulation.alpha(1).restart()
  if (physicsActive.value) simulation.alphaTarget(0)
}

function syncSimulation() {
  if (!simulation) return
  simulation.nodes(nodeData)
  const linkForce = simulation.force('link')
  if (linkForce) {
    linkForce.links(linkData)
    linkForce.id((d: any) => d.id)
  }
}

function ensureSimulation() {
  if (simulation) return
  const linkForce = d3.forceLink<any, any>([])
    .id((d: any) => d.id)
    .distance(FORCE_PARAMS.linkDistance)
    .strength((l: any) => 1 / Math.min(6, Math.max(1, Math.min(
      nodeMap.get(typeof l.source === 'object' ? l.source.id : l.source)?.degree || 1,
      nodeMap.get(typeof l.target === 'object' ? l.target.id : l.target)?.degree || 1
    ))))
  simulation = d3.forceSimulation<any>([])
    .force('link', linkForce)
    .force('charge', d3.forceManyBody().strength(FORCE_PARAMS.chargeStrength))
    .force('center', d3.forceCenter(size.w / 2, size.h / 2))
    .force('collide', d3.forceCollide((d: any) => (d.r || 12) + FORCE_PARAMS.collidePadding))
    .alphaDecay(FORCE_PARAMS.alphaDecay)
    .velocityDecay(FORCE_PARAMS.velocityDecay)
    .on('tick', () => render())
    .on('end', () => {
      converged.value = true
      if (physicsActive.value) physicsActive.value = false
      persist()
    })
}

// ---------- 布局 ----------
function applyLayout(name: LayoutName) {
  if (!nodeData.length) return
  const pinned: Record<string, [number, number]> = {}
  const prev: Record<string, [number, number]> = {}
  for (const n of nodeData) {
    prev[n.id] = [n.x, n.y]
    if (n.fx != null && n.fy != null) pinned[n.id] = [n.fx, n.fy]
  }
  const result = computeLayout(name, {
    nodes: nodeData.map(n => ({
      id: n.id,
      dirPath: n.dirPath,
      domain: n.domain,
      updatedAt: n.updatedAt,
      inDegree: n.inDegree,
      degree: n.degree
    })),
    edges: linkData.map(l => ({ source: l.source, target: l.target })),
    width: size.w,
    height: size.h,
    prev,
    pinned
  })

  if (result.live) {
    // 力导向：落到播种位置后点火，由 d3 接手
    for (const n of nodeData) {
      const p = result.positions[n.id]
      if (!p) continue
      if (n.fx == null || n.fy == null) {
        n.x = p[0]
        n.y = p[1]
      }
    }
    restartSimulation()
    render()
    return
  }

  simulation?.stop()
  tweenTo(result.positions)
}

function tweenTo(targets: Record<string, [number, number]>) {
  if (tweenRaf) cancelAnimationFrame(tweenRaf)
  const from = new Map<string, [number, number]>()
  for (const n of nodeData) from.set(n.id, [n.x, n.y])
  const t0 = performance.now()
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const step = () => {
    const p = Math.min(1, (performance.now() - t0) / LAYOUT_TRANSITION_MS)
    const e = ease(p)
    for (const n of nodeData) {
      const f = from.get(n.id)
      const t = targets[n.id]
      if (!f || !t) continue
      if (n.fx != null && n.fy != null) continue
      n.x = f[0] + (t[0] - f[0]) * e
      n.y = f[1] + (t[1] - f[1]) * e
    }
    render()
    if (p < 1) {
      tweenRaf = requestAnimationFrame(step)
    } else {
      tweenRaf = null
      persist()
    }
  }
  tweenRaf = requestAnimationFrame(step)
}

// ---------- 对外方法 ----------
const selectNode = (id: string) => emit('update:selectedId', id)
const clearSelection = () => emit('update:selectedId', null)
const getNeighbors = (id: string) => {
  const out: string[] = []
  for (const l of linkData) {
    if (l.source === id) out.push(l.target)
    else if (l.target === id) out.push(l.source)
  }
  return out
}
const shortestPath = (fromId: string, toId: string) => {
  if (fromId === toId) return [fromId]
  const prev = new Map<string, string>()
  const seen = new Set([fromId])
  let frontier = [fromId]
  while (frontier.length) {
    const next: string[] = []
    for (const cur of frontier) {
      for (const nb of getNeighbors(cur)) {
        if (seen.has(nb)) continue
        seen.add(nb)
        prev.set(nb, cur)
        if (nb === toId) {
          const path = [toId]
          let step = toId
          while (prev.has(step)) {
            step = prev.get(step)!
            path.unshift(step)
          }
          return path
        }
        next.push(nb)
      }
    }
    frontier = next
  }
  return null
}

const resetLayout = () => {
  for (const n of nodeData) {
    n.fx = null
    n.fy = null
    n.pinned = false
  }
  pinnedCount.value = 0
  patchGraphState({ pos: {}, pinned: [] })
  if (svgRef.value && zoomBehavior) {
    d3.select(svgRef.value).call(zoomBehavior.transform, d3.zoomIdentity)
  }
  applyLayout(props.layout === 'force' ? 'force' : props.layout)
  if (props.layout !== 'force') restartSimulation()
  physicsActive.value = true
}

const togglePhysics = () => {
  physicsActive.value = !physicsActive.value
  if (physicsActive.value) {
    converged.value = false
    simulation?.alpha(0.6).restart()
  } else {
    simulation?.stop()
  }
}

const zoomBy = (factor: number) => {
  if (!svgRef.value || !zoomBehavior) return
  d3.select(svgRef.value).transition().duration(ZOOM.transitionMs).call(zoomBehavior.scaleBy, factor)
}

const fitView = () => {
  if (!svgRef.value || !zoomBehavior || !nodeData.length) return
  const drawn = drawnIds.value
  const pts = nodeData.filter(n => (!drawn || drawn.has(n.id)) && Number.isFinite(n.x) && Number.isFinite(n.y))
  if (!pts.length) return
  const xs = pts.map(n => n.x)
  const ys = pts.map(n => n.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = ZOOM.fitPad
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  const k = Math.max(minScale(), Math.min(ZOOM.fitMax, Math.min((size.w - pad * 2) / w, (size.h - pad * 2) / h)))
  const t = d3.zoomIdentity
    .translate(size.w / 2 - k * ((minX + maxX) / 2), size.h / 2 - k * ((minY + maxY) / 2))
    .scale(k)
  d3.select(svgRef.value).transition().duration(ZOOM.fitTransitionMs).call(zoomBehavior.transform, t)
}

/** 定位到某篇笔记（按 slug 或 id），居中放大 + 脉冲高亮 */
const focusNode = (key: string) => {
  if (!svgRef.value || !zoomBehavior) return false
  const target = nodeData.find(n => n.slug === key || n.id === key)
  if (!target) return false
  const k = 1.6
  const t = d3.zoomIdentity
    .translate(size.w / 2 - k * target.x, size.h / 2 - k * target.y)
    .scale(k)
  d3.select(svgRef.value).transition().duration(ZOOM.fitTransitionMs).call(zoomBehavior.transform, t)
  emit('update:selectedId', target.id)
  if (nodeSel && tier.value === 'svg') {
    nodeSel.filter((d: VNode) => d.id === target.id).select('circle.gnode-dot')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 5)
      .transition().duration(600)
      .attr('stroke', (d: VNode) => (d.isolated ? 'var(--ink-3)' : 'var(--canvas)'))
      .attr('stroke-width', (d: VNode) => (d.isolated ? FOCUS_STYLE.isolatedStrokeWidth : FOCUS_STYLE.nodeBaseStrokeWidth))
  }
  return true
}

/** 缩略图快照：节点图坐标（与屏幕无关）+ 画布尺寸 + 当前视口变换 */
const minimap = () => {
  const drawn = drawnIds.value
  return {
    nodes: nodeData
      .filter(n => (!drawn || drawn.has(n.id)) && Number.isFinite(n.x) && Number.isFinite(n.y))
      .map(n => ({ id: n.id, x: n.x, y: n.y, r: n.r, degree: n.degree })),
    canvas: { w: size.w, h: size.h },
    view: { x: currentZoom.x, y: currentZoom.y, k: currentZoom.k }
  }
}

/** 把视口中心移到图坐标 (gx, gy)（缩略图拖拽平移用） */
const centerOn = (gx: number, gy: number) => {
  if (!svgRef.value || !zoomBehavior) return
  const k = currentZoom.k
  const t = d3.zoomIdentity.translate(size.w / 2 - k * gx, size.h / 2 - k * gy).scale(k)
  d3.select(svgRef.value).call(zoomBehavior.transform, t)
}

/** 设置缩放并保持视口中心不动（缩略图滚轮缩放用） */
const zoomTo = (k: number) => {
  if (!svgRef.value || !zoomBehavior) return
  const cx = (size.w / 2 - currentZoom.x) / currentZoom.k
  const cy = (size.h / 2 - currentZoom.y) / currentZoom.k
  const nk = Math.max(minScale(), Math.min(ZOOM.max, k))
  const t = d3.zoomIdentity.translate(size.w / 2 - nk * cx, size.h / 2 - nk * cy).scale(nk)
  d3.select(svgRef.value).call(zoomBehavior.transform, t)
}

const relayout = () => applyLayout(props.layout)
const pinnedIds = () => nodeData.filter(n => n.fx != null && n.fy != null).map(n => n.id)

// ---------- 键盘 ----------
const onKeydown = (e: KeyboardEvent) => {
  const key = e.key
  if (key === 'Escape') {
    if (props.selectedId) {
      clearSelection()
      e.stopPropagation()
    }
    return
  }
  if (key === 'Enter') {
    const cur = props.selectedId ? nodeMap.get(props.selectedId) : null
    if (!cur) return
    e.preventDefault()
    if (props.pickingPath) emit('pick', cur.id)
    else emit('open', cur.slug)
    return
  }
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    e.preventDefault()
    moveSelection(key)
  }
}

/** ↑↓←→ 按几何邻近移动选中焦点 */
function moveSelection(dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') {
  if (!nodeData.length) return
  const cur = props.selectedId ? nodeMap.get(props.selectedId) : null
  if (!cur) {
    const best = [...nodeData].sort((a, b) => b.degree - a.degree)[0]
    if (best) {
      emit('update:selectedId', best.id)
      liveMessage.value = `已选中「${best.title}」`
    }
    return
  }
  const dx = dir === 'ArrowLeft' ? -1 : dir === 'ArrowRight' ? 1 : 0
  const dy = dir === 'ArrowUp' ? -1 : dir === 'ArrowDown' ? 1 : 0
  let bestNode: VNode | null = null
  let bestScore = Infinity
  for (const n of nodeData) {
    if (n.id === cur.id) continue
    const vx = n.x - cur.x
    const vy = n.y - cur.y
    const along = vx * dx + vy * dy
    if (along <= 1) continue
    const perp = Math.abs(vx * dy - vy * dx)
    const score = along + perp * 2.2
    if (score < bestScore) {
      bestScore = score
      bestNode = n
    }
  }
  if (bestNode) {
    emit('update:selectedId', bestNode.id)
    liveMessage.value = `已选中「${bestNode.title}」`
  }
}

// ---------- 尺寸与主题 ----------
function measure() {
  const host = hostRef.value
  if (!host) return
  size.w = host.clientWidth || 800
  size.h = host.clientHeight || 500
}

function onResize() {
  measure()
  if (zoomBehavior && svgRef.value) {
    const before = zoomBehavior.scaleExtent()[0]
    zoomBehavior.scaleExtent([minScale(), ZOOM.max])
    if (before !== minScale()) d3.select(svgRef.value).call(zoomBehavior)
  }
  const center = simulation?.force('center')
  if (center) center.x(size.w / 2).y(size.h / 2)
  simulation?.alpha(0.3).restart()
  if (tier.value === 'canvas') {
    drawCanvas()
    positionLabels()
  }
}

// ---------- 生命周期 ----------
onMounted(() => {
  if (!hostRef.value || !svgRef.value) return
  mountAt = performance.now()
  refreshCssVars()
  measure()

  const svg = d3.select(svgRef.value)
  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([minScale(), ZOOM.max])
    .on('start', () => { zoomMoved = 0 })
    .on('zoom', (event: any) => {
      currentZoom = event.transform
      zoomK.value = event.transform.k.toFixed(3)
      if (event.sourceEvent) zoomMoved += Math.abs(event.sourceEvent.movementX || 0) + Math.abs(event.sourceEvent.movementY || 0)
      d3.select(viewportRef.value).attr('transform', event.transform.toString())
      if (tier.value === 'canvas') {
        drawCanvas()
        positionLabels()
      }
    })
    .on('end', () => persist())
  svg.call(zoomBehavior)

  svg.on('click', (event: any) => {
    if (event.target !== svgRef.value) return
    if (zoomMoved > DRAG_CLICK_THRESHOLD_PX) {
      zoomMoved = 0
      return
    }
    if (props.pickingPath) return
    clearSelection()
  })

  const saved = readGraphState().zoom
  if (saved && Number.isFinite(saved.k)) {
    currentZoom = d3.zoomIdentity.translate(saved.x, saved.y).scale(saved.k)
    svg.call(zoomBehavior.transform, currentZoom)
    zoomK.value = currentZoom.k.toFixed(3)
  } else {
    d3.select(viewportRef.value).attr('transform', currentZoom.toString())
  }

  ensureSimulation()
  syncGraph()

  if (props.layout !== 'force') applyLayout(props.layout)

  window.addEventListener('beforeunload', persist)
  window.addEventListener('resize', onResize)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => onResize())
    resizeObserver.observe(hostRef.value)
  }
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      refreshCssVars()
      if (tier.value === 'canvas') drawCanvas()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }

  // FPS 打点（rAF 滑动窗口）
  let frames = 0
  let last = performance.now()
  const loop = () => {
    frames++
    const now = performance.now()
    if (now - last >= 500) {
      fps.value = Math.round((frames * 1000) / (now - last))
      frames = 0
      last = now
    }
    fpsRaf = requestAnimationFrame(loop)
  }
  fpsRaf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  persist()
  simulation?.stop()
  simulation = null
  if (tweenRaf) cancelAnimationFrame(tweenRaf)
  if (fpsRaf) cancelAnimationFrame(fpsRaf)
  if (clickTimer) clearTimeout(clickTimer)
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  window.removeEventListener('beforeunload', persist)
  window.removeEventListener('resize', onResize)
})

watch(() => props.nodes, () => syncGraph())
watch(() => props.edges, () => syncGraph())
watch(() => props.layout, (v) => applyLayout(v))
watch([() => props.selectedId, () => props.showLabels, () => props.focusIds], () => {
  if (tier.value === 'svg') buildLayers()
  else {
    drawCanvas()
    positionLabels()
  }
  render()
})

function onPointerDownCapture(e: PointerEvent) {
  const next = e.pointerType === 'touch'
  if (next !== touchMode) {
    touchMode = next
    if (nodeSel) nodeSel.select('circle.gnode-hit').attr('r', (d: VNode) => hitRadiusOf(d))
  }
}

defineExpose({
  selectNode,
  clearSelection,
  getNeighbors,
  shortestPath,
  resetLayout,
  togglePhysics,
  zoomBy,
  fitView,
  focusNode,
  relayout,
  pinnedIds,
  minimap,
  centerOn,
  zoomTo,
  renderStatus: () => ({
    fps: fps.value,
    firstPaintMs: firstPaintMs.value,
    nodeCount: props.nodes.length,
    edgeCount: props.edges.length,
    drawnCount: drawnCount.value,
    tier: tier.value,
    converged: converged.value,
    zoomK: Number(zoomK.value)
  })
})
</script>

<style scoped>
.graph-host :deep(.graph-label) {
  position: absolute;
  left: 0;
  top: 0;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1;
  color: var(--ink-2);
  text-shadow:
    -1px -1px 0 var(--surface),
    1px -1px 0 var(--surface),
    -1px 1px 0 var(--surface),
    1px 1px 0 var(--surface);
}
</style>
