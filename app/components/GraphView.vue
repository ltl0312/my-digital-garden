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
    :data-tier="tier"
    :data-match-count="matchSet.size"
    @keydown="onKeydown"
    @pointerdown="onPointerDownCapture"
    @contextmenu.prevent="onCanvasContextMenu"
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
import type { GraphEdge, GraphNode, GraphTuning, LabelMode, LayoutName } from '~/lib/graph-types'
import {
  CENTER_FORCE_SCALE,
  DRAG_CLICK_THRESHOLD_PX,
  EDGE_STYLE,
  FOCUS_STYLE,
  LAYOUT_TRANSITION_MS,
  MATURITY_COLORS,
  MAX_LABELS,
  PIN_DOT_RADIUS,
  RENDER_TIERS,
  TOUCH_HIT_RADIUS,
  ZOOM,
  isMocTitle
} from '~/lib/graph-constants'
import { FORCE_PARAMS, computeLayout } from '~/lib/graphLayouts'
import { patchGraphState, readGraphState } from '~/lib/graphState'
import { domainColor } from '#shared/graph-domain'

/** 页面可附带 degree / isolated（缺省时由边就地推算） */
export type GraphNodeProp = GraphNode & { degree?: number; isolated?: boolean }

/**
 * 右键菜单载荷（需求 m01104 后续第 6 条）。
 * `id === null` 表示在画布空白处右键；x/y 是**相对画布左上角**的像素坐标，
 * 页面拿到后自己按视口边界做避让，GraphView 不关心菜单长什么样。
 */
export interface GraphContextPayload {
  id: string | null
  x: number
  y: number
}

/** 节点自定义颜色的写意图（颜色本身由页面持有并同步到服务端，GraphView 只负责发意图） */
export interface GraphColorPayload {
  id: string
  slug: string
  color: string | null
}

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
  /** 标题以 MOC 开头：常态下只有这些节点标注名称 */
  isMoc: boolean
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
  /** 标签显示模式：moc = 常态只标注 MOC 节点（默认）/ all = 全部 / off = 关闭 */
  labelMode: LabelMode
  /** 控制面板参数（显示 + 力导向） */
  tuning: GraphTuning
  pickingPath: boolean
  /**
   * 节点自定义颜色：**slug → CSS 颜色**。
   * 由页面持有（useGraphColors 负责与服务端同步），GraphView 只读不写。
   */
  colorMap?: Record<string, string>
  /** 批量上色正在圈选的节点 id；命中的节点画一圈强调色描边 */
  matchIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:selectedId', v: string | null): void
  (e: 'open', slug: string): void
  (e: 'pick', id: string): void
  (e: 'ready'): void
  (e: 'contextmenu', payload: GraphContextPayload): void
  (e: 'setColor', payload: GraphColorPayload): void
  (e: 'clearColors'): void
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
type GraphCssVar = 'line' | 'edgeLink' | 'edgeTag' | 'surface' | 'ink2' | 'ink3' | 'accent' | 'canvas'
// 用有限键的映射类型而非 Record<string,string>：后者在 noUncheckedIndexedAccess 下
// 每次取值都是 `string | undefined`，无法直接赋给 canvas 的 fillStyle/strokeStyle。
let cssVars: Record<GraphCssVar, string> = {
  line: '#E6E3D9',
  edgeLink: '#94A0AF',
  edgeTag: '#C2AF90',
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
  const scale = props.tuning.nodeScale
  if (isolated) return 9 * scale
  return Math.min(36, Math.max(11, 11 + degree * 2)) * scale
}

/**
 * 节点填充色：**自定义色优先**，否则按领域取色（无领域时回落到成熟度色）。
 * 自定义色由页面持有（`props.colorMap`，slug → 颜色，useGraphColors 同步到服务端），
 * 这里只读——GraphView 不再自己读写 localStorage。
 */
const colorMap = computed(() => props.colorMap || {})

const colorOf = (n: { slug: string; domain: string; maturity: string }) => {
  const custom = colorMap.value[n.slug]
  if (custom) return custom
  return n.domain ? domainColor(n.domain) : (MATURITY_COLORS[n.maturity] || '#8C6D46')
}

/** 批量上色正在圈选的节点集合 */
const matchSet = computed(() => new Set(props.matchIds || []))

const hitRadiusOf = (n: VNode) => (isTouchNow() ? TOUCH_HIT_RADIUS : Math.max(14, n.r + 6))

// ---------- 主题变量（canvas 绘制用） ----------
function refreshCssVars() {
  if (typeof document === 'undefined') return
  const cs = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) => (cs.getPropertyValue(name).trim() || fallback)
  cssVars = {
    line: pick('--line', '#E6E3D9'),
    edgeLink: pick('--edge-link', '#94A0AF'),
    edgeTag: pick('--edge-tag', '#C2AF90'),
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
/**
 * 一条连线的两端坐标。
 */
function edgeGeometry(s: VNode, t: VNode): [number, number, number, number] | null {
  // 力导向 initialize 之前 source/target 可能还是 id 字符串，坐标缺失时返回 null，
  // 由调用方移除属性 —— 等价于 d3.attr(name, null) 的语义（否则 setAttribute 会写入 "undefined" 并报 console 错）
  if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y) || !Number.isFinite(t?.x) || !Number.isFinite(t?.y)) return null
  return [s.x, s.y, t.x, t.y]
}

function render() {
  if (!nodeSel) return
  if (tier.value === 'svg' && linkSel) {
    // 用 each 一次算完四个坐标：attr 链会让 edgeGeometry 每条线被调用四遍
    linkSel.each(function (this: SVGLineElement, d: any) {
      const g = edgeGeometry(d.source, d.target)
      if (!g) {
        this.removeAttribute('x1')
        this.removeAttribute('y1')
        this.removeAttribute('x2')
        this.removeAttribute('y2')
        return
      }
      const [x1, y1, x2, y2] = g
      this.setAttribute('x1', String(x1))
      this.setAttribute('y1', String(y1))
      this.setAttribute('x2', String(x2))
      this.setAttribute('y2', String(y2))
    })
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
  const ew = props.tuning.edgeWidth

  // 连线
  ctx.lineWidth = (EDGE_STYLE.baseWidth * ew) / k
  for (const l of linkData) {
    const s = nodeMap.get(l.source)
    const t = nodeMap.get(l.target)
    if (!s || !t || !inDraw(s.id) || !inDraw(t.id)) continue
    const hot = !focus || (focus.has(s.id) && focus.has(t.id))
    ctx.globalAlpha = hot ? 0.9 : EDGE_STYLE.dimOpacity
    ctx.strokeStyle = l.kind === 'tag' ? cssVars.edgeTag : cssVars.edgeLink
    ctx.lineWidth = ((hot && focus ? EDGE_STYLE.focusWidth : EDGE_STYLE.baseWidth) * ew) / k
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
    ctx.lineWidth = (matchSet.value.has(n.id)
      ? FOCUS_STYLE.nodeStrokeWidth + 1
      : (hot && focus && n.id === props.selectedId ? FOCUS_STYLE.nodeStrokeWidth : FOCUS_STYLE.nodeBaseStrokeWidth)) / k
    ctx.strokeStyle = matchSet.value.has(n.id) ? cssVars.accent : (n.isolated ? cssVars.ink3 : cssVars.canvas)
    if (n.isolated && !matchSet.value.has(n.id)) ctx.setLineDash([3 / k, 3 / k])
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

/**
 * 单个节点当前是否显示名称。
 * · 选中 / 悬停：始终显示（交互反馈优先）
 * · 聚焦态：只显示被聚焦的节点——常态被隐藏的普通节点，聚焦时会全部露出来
 * · 常态：按 labelMode —— moc 只显示 MOC 节点（默认），all 全部显示，off 全部隐藏
 */
function labelVisible(n: VNode): boolean {
  if (n.id === props.selectedId) return true
  if (hoverCard.value?.title === n.title) return true
  const focus = focusSet.value
  if (focus) return focus.has(n.id)
  if (props.labelMode === 'off') return false
  if (props.labelMode === 'all') return true
  return n.isMoc
}

function labelsToShow(): LabelNode[] {
  const focus = focusSet.value
  const out: LabelNode[] = []
  for (const n of nodeData) {
    if (!labelVisible(n)) continue
    out.push(Object.assign(n, { labelText: n.title.length > 14 ? `${n.title.slice(0, 14)}…` : n.title }))
    // 聚焦时用户要看到**全部**被聚焦节点的名字，所以上限只在常态下生效
    if (!focus && out.length >= MAX_LABELS) break
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
      .attr('stroke', (d: VLink) => (d.kind === 'tag' ? 'var(--edge-tag)' : 'var(--edge-link)'))
      .attr('stroke-width', EDGE_STYLE.baseWidth * props.tuning.edgeWidth)
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
      .attr('stroke', (d: VNode) => (matchSet.value.has(d.id) ? 'var(--accent)' : (d.isolated ? 'var(--ink-3)' : 'var(--canvas)')))
      .attr('stroke-width', (d: VNode) => (matchSet.value.has(d.id)
        ? FOCUS_STYLE.nodeStrokeWidth + 1
        : (d.isolated ? FOCUS_STYLE.isolatedStrokeWidth : FOCUS_STYLE.nodeBaseStrokeWidth)))
      .attr('stroke-dasharray', (d: VNode) => (d.isolated && !matchSet.value.has(d.id) ? '3 3' : null))
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
      .attr('opacity', (d: VNode) => (labelVisible(d) ? 1 : 0))
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
        d3.select(event.currentTarget).select('circle.gnode-dot')
          .attr('stroke-width', d.isolated ? FOCUS_STYLE.isolatedStrokeWidth : FOCUS_STYLE.nodeBaseStrokeWidth)
        d3.select(event.currentTarget).select('text.gnode-label')
          .attr('opacity', labelVisible(d) ? 1 : 0)
      }
    })
    .on('contextmenu', (event: any, d: VNode) => {
      // 阻止默认菜单 + 掐掉待触发的单击定时器：
      // 否则右键之后紧跟的 click 会把菜单打开时选中的节点又改一遍。
      event.preventDefault()
      event.stopPropagation()
      if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
      }
      hoverCard.value = null
      emit('contextmenu', { id: d.id, ...localPoint(event) })
    })
}

/** 鼠标事件 → 相对画布左上角的坐标（右键菜单贴边避让用） */
function localPoint(event: { clientX?: number; clientY?: number }) {
  const rect = hostRef.value?.getBoundingClientRect()
  if (!rect || event.clientX == null || event.clientY == null) return { x: size.w / 2, y: size.h / 2 }
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

/** 画布空白处右键：交给页面弹「画布菜单」 */
function onCanvasContextMenu(e: MouseEvent) {
  emit('contextmenu', { id: null, ...localPoint(e) })
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
      old.isMoc = isMocTitle(p.title)
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
      isMoc: isMocTitle(p.title),
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

// ---------- 力导向参数（控制面板可调） ----------
/** 连接力：沿用「两端度数越大、连接越松」的既有曲线，再乘控制面板系数 */
function linkStrengthOf(l: any) {
  const s = nodeMap.get(typeof l.source === 'object' ? l.source.id : l.source)?.degree || 1
  const t = nodeMap.get(typeof l.target === 'object' ? l.target.id : l.target)?.degree || 1
  return (1 / Math.min(6, Math.max(1, Math.min(s, t)))) * props.tuning.linkStrength
}

/**
 * 排斥力：聚焦时**被聚焦的节点**额外放大 focusRepel 倍（需求 m01104 第 2 条），
 * 让聚焦邻域自动散开、名字不叠在一起。
 */
function chargeStrengthOf(d: any) {
  const base = FORCE_PARAMS.chargeStrength * props.tuning.chargeStrength
  const focus = focusSet.value
  return focus && focus.has(d.id) ? base * props.tuning.focusRepel : base
}

/**
 * 把当前 tuning 与画布尺寸同步进 d3 的各个力。
 * d3 的 `.strength()` / `.distance()` setter 内部会调用 `initialize()`，
 * 所以改完 accessor 之后必须再 restart 才生效（见 reheat）。
 */
function refreshForces() {
  if (!simulation) return
  const t = props.tuning
  const cx = size.w / 2
  const cy = size.h / 2
  const linkForce = simulation.force('link')
  if (linkForce) {
    linkForce.distance(FORCE_PARAMS.linkDistance * t.linkDistance)
    linkForce.strength(linkStrengthOf)
  }
  const charge = simulation.force('charge')
  if (charge) charge.strength(chargeStrengthOf)
  // forceCenter 只做刚性平移（不改变相对布局），可调的那一份中心力由 forceX/forceY 承担
  const center = simulation.force('center')
  if (center) center.x(cx).y(cy)
  const fx = simulation.force('x')
  if (fx) fx.x(cx).strength(t.centerStrength * CENTER_FORCE_SCALE)
  const fy = simulation.force('y')
  if (fy) fy.y(cy).strength(t.centerStrength * CENTER_FORCE_SCALE)
  const collide = simulation.force('collide')
  if (collide) collide.radius((d: any) => (d.r || 12) + FORCE_PARAMS.collidePadding)
}

/** 重新点火：把仿真从收敛状态拉起来（alpha 越大抖得越厉害） */
function reheat(alpha = 0.5) {
  if (!simulation) return
  converged.value = false
  simulation.alpha(alpha).restart()
  if (!physicsActive.value) physicsActive.value = true
}

function restartSimulation() {
  if (!simulation) return
  simulation.nodes(nodeData)
  const linkForce = simulation.force('link')
  if (linkForce) {
    linkForce.links(linkData)
    linkForce.id((d: any) => d.id)
  }
  refreshForces()
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
    .distance(FORCE_PARAMS.linkDistance * props.tuning.linkDistance)
    .strength(linkStrengthOf)
  simulation = d3.forceSimulation<any>([])
    .force('link', linkForce)
    .force('charge', d3.forceManyBody().strength(chargeStrengthOf))
    .force('center', d3.forceCenter(size.w / 2, size.h / 2))
    .force('x', d3.forceX(size.w / 2).strength(props.tuning.centerStrength * CENTER_FORCE_SCALE))
    .force('y', d3.forceY(size.h / 2).strength(props.tuning.centerStrength * CENTER_FORCE_SCALE))
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
      .map(n => ({ id: n.id, x: n.x, y: n.y, r: n.r, degree: n.degree, domain: n.domain, color: n.color })),
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

/** 右键菜单用：切换单个节点的固定状态，返回切换后是否处于固定 */
function togglePin(id: string): boolean {
  const n = nodeData.find(d => d.id === id)
  if (!n) return false
  if (n.fx != null && n.fy != null) {
    n.fx = null
    n.fy = null
    n.pinned = false
  } else {
    n.fx = n.x
    n.fy = n.y
    n.pinned = true
  }
  redraw()
  persist()
  return n.pinned
}

const isPinned = (id: string) => pinnedIds().includes(id)

// ---------- 节点自定义颜色（右键菜单 / 批量上色面板） ----------
// 颜色状态不在本组件里：页面用 useGraphColors 持有（slug → 颜色）并同步到服务端，
// 通过 props.colorMap 传进来。这里只做两件事——按 map 上色、把用户的写意图发回页面。
/** 重算全部节点填充色并就地刷新：只改颜色，不碰坐标，所以不重新点火 */
function recolor() {
  for (const n of nodeData) n.color = colorOf(n)
  if (tier.value === 'svg' && nodeSel) {
    nodeSel.select('circle.gnode-dot').attr('fill', (d: VNode) => d.color)
  }
  render()
}

/** 设置 / 清除单个节点的自定义颜色（color 传 null = 恢复领域色） */
const setNodeColor = (id: string, color: string | null) => {
  const n = nodeData.find(x => x.id === id)
  if (!n) return
  emit('setColor', { id, slug: n.slug, color })
}

/** 清除全部节点的自定义颜色 */
const resetNodeColors = () => emit('clearColors')

/** 该节点是否被改过颜色（右键菜单据此显示「恢复领域色」） */
const nodeColorOf = (id: string): string | null => {
  const n = nodeData.find(x => x.id === id)
  return n ? (colorMap.value[n.slug] || null) : null
}

const customColorCount = computed(() => Object.keys(colorMap.value).length)

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
  refreshForces()
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
/** 只重画、不碰仿真：选中项 / 标签模式变化时用 */
function redraw() {
  if (tier.value === 'svg') buildLayers()
  else {
    drawCanvas()
    positionLabels()
  }
  render()
}

watch([() => props.selectedId, () => props.labelMode], () => redraw())

// 自定义颜色变化：只重算颜色并重画，不动仿真（改色不该让图重新跑一遍）
watch(() => props.colorMap, () => recolor(), { deep: true })

// 批量上色的圈选集合变化：重画描边强调圈（同样不碰仿真）
watch(() => props.matchIds, () => redraw())

// 聚焦变化：被聚焦节点的排斥力要变大，所以除了重画还得把仿真重新点着
watch(() => props.focusIds, () => {
  refreshForces()
  reheat(0.5)
  redraw()
})

// 控制面板参数：节点半径 / 连线粗细 / 各个力都要跟着变
watch(() => props.tuning, () => {
  for (const n of nodeData) n.r = radiusOf(n.degree, n.isolated)
  if (tier.value === 'svg') buildLayers()
  else {
    nodeSel?.select('circle.gnode-hit').attr('r', (d: VNode) => hitRadiusOf(d))
    drawCanvas()
    positionLabels()
  }
  refreshForces()
  reheat(0.6)
  render()
}, { deep: true })

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
  reheat,
  zoomBy,
  fitView,
  focusNode,
  relayout,
  pinnedIds,
  minimap,
  centerOn,
  zoomTo,
  setNodeColor,
  resetNodeColors,
  nodeColorOf,
  togglePin,
  isPinned,
  renderStatus: () => ({
    fps: fps.value,
    firstPaintMs: firstPaintMs.value,
    nodeCount: props.nodes.length,
    edgeCount: props.edges.length,
    drawnCount: drawnCount.value,
    tier: tier.value,
    converged: converged.value,
    zoomK: Number(zoomK.value),
    labelMode: props.labelMode,
    labelCount: labelsToShow().length,
    mocCount: nodeData.filter(n => n.isMoc).length,
    focusedCount: focusSet.value ? focusSet.value.size : 0,
    customColorCount: customColorCount.value,
    tuning: { ...props.tuning }
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
