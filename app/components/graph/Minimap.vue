<template>
  <!-- 缩略图（计划书 T3.3）：右上角 164×112，可拖拽平移、滚轮缩放 -->
  <div
    class="relative rounded-[10px] border border-line bg-surface/95 backdrop-blur shadow-ds1 overflow-hidden select-none touch-none"
    :style="{ width: MINIMAP.width + 'px', height: MINIMAP.height + 'px' }"
    data-testid="graph-minimap"
    :data-minimap-dots="dots.length"
    :data-minimap-edges="lines.length"
    :aria-label="`图谱缩略图，共 ${nodes.length} 个节点`"
    role="img"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel.prevent="onWheel"
  >
    <svg :width="MINIMAP.width" :height="MINIMAP.height" class="block">
      <g :transform="`translate(${fit.tx},${fit.ty}) scale(${fit.scale})`">
        <!-- 连线画在点下面：缩略图要能看出图的结构，否则 500 多个点糊成一片灰 -->
        <line
          v-for="(l, i) in lines"
          :key="`e${i}`"
          class="mm-edge"
          :x1="l.x1"
          :y1="l.y1"
          :x2="l.x2"
          :y2="l.y2"
          stroke="var(--edge-link)"
          :stroke-opacity="MINIMAP.edgeOpacity"
          :stroke-width="1 / fit.scale"
        />
        <circle
          v-for="n in dots"
          :key="n.id"
          class="mm-dot"
          :cx="n.x"
          :cy="n.y"
          :r="radiusScreen(n) / fit.scale"
          :fill="n.color || 'var(--ink-3)'"
          opacity="0.85"
        />
        <rect
          class="mm-view"
          :x="viewRect.x"
          :y="viewRect.y"
          :width="viewRect.w"
          :height="viewRect.h"
          fill="var(--accent)"
          fill-opacity="0.08"
          stroke="var(--accent)"
          stroke-opacity="0.55"
          :stroke-width="1 / fit.scale"
          rx="2"
        />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { MINIMAP, RENDER_TIERS } from '~/lib/graph-constants'

export interface MinimapNode {
  id: string
  x: number
  y: number
  r: number
  degree: number
  /** 领域名（保留给提示用） */
  domain?: string
  /** 已解析好的填充色：自定义色优先，否则领域色 */
  color?: string
}

export interface MinimapEdge {
  source: string
  target: string
}

const props = defineProps<{
  nodes: MinimapNode[]
  canvas: { w: number; h: number }
  view: { x: number; y: number; k: number }
  /** 可见连线；缺省则不画线 */
  edges?: MinimapEdge[]
}>()

const emit = defineEmits<{
  (e: 'center', gx: number, gy: number): void
  (e: 'zoom', k: number): void
}>()

const WIDTH = MINIMAP.width
const HEIGHT = MINIMAP.height
const PAD = MINIMAP.pad

/** 缩略图只画度数 Top 200（与主画布 >600 时的收敛口径一致） */
const dots = computed<MinimapNode[]>(() => {
  if (props.nodes.length <= RENDER_TIERS.canvas) return props.nodes
  return [...props.nodes]
    .sort((a, b) => b.degree - a.degree)
    .slice(0, RENDER_TIERS.topN)
})

/**
 * 点半径按**屏幕像素**给：老实现直接把主画布的图坐标半径除以 fit.scale，
 * 得到 11–36 屏幕像素的圆，525 个就把 164×112 糊成一片灰。
 * 这里按 sqrt(degree) 归一到 [dotMin, dotMax] 像素，绘制时再换算回图坐标。
 */
const maxDegree = computed(() => dots.value.reduce((m, n) => Math.max(m, n.degree || 0), 0) || 1)

function radiusScreen(n: MinimapNode) {
  const t = Math.sqrt(Math.max(0, n.degree || 0)) / Math.sqrt(maxDegree.value)
  return MINIMAP.dotMin + (MINIMAP.dotMax - MINIMAP.dotMin) * t
}

const bounds = computed(() => {
  const pts = dots.value
  if (!pts.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of pts) {
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }
  return { minX, maxX, minY, maxY }
})

const fit = computed(() => {
  const b = bounds.value
  const w = Math.max(1, b.maxX - b.minX)
  const h = Math.max(1, b.maxY - b.minY)
  const scale = Math.max(0.0001, Math.min((WIDTH - PAD * 2) / w, (HEIGHT - PAD * 2) / h))
  const tx = (WIDTH - w * scale) / 2 - b.minX * scale
  const ty = (HEIGHT - h * scale) / 2 - b.minY * scale
  return { scale, tx, ty }
})

/**
 * 连线：两端都落在已绘制的点里才画，条数上限 MINIMAP.maxEdges。
 * 超限时按步长等距抽样，而不是简单截断——截断会让缩略图只剩图的一角有结构。
 */
const lines = computed(() => {
  const es = props.edges
  if (!es || !es.length) return []
  const pos = new Map<string, { x: number; y: number }>()
  for (const n of dots.value) pos.set(n.id, { x: n.x, y: n.y })
  const kept: { x1: number; y1: number; x2: number; y2: number }[] = []
  const step = Math.max(1, Math.ceil(es.length / MINIMAP.maxEdges))
  for (let i = 0; i < es.length; i += step) {
    const e = es[i]
    if (!e) continue
    const a = pos.get(e.source)
    const b = pos.get(e.target)
    if (!a || !b) continue
    kept.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  return kept
})

const viewRect = computed(() => {
  const k = props.view.k || 1
  // 主画布可见区域（图坐标）
  const gx0 = -props.view.x / k
  const gy0 = -props.view.y / k
  const gx1 = (props.canvas.w - props.view.x) / k
  const gy1 = (props.canvas.h - props.view.y) / k
  const f = fit.value
  const x = gx0 * f.scale + f.tx
  const y = gy0 * f.scale + f.ty
  const w = (gx1 - gx0) * f.scale
  const h = (gy1 - gy0) * f.scale
  return { x, y, w: Math.max(2, w), h: Math.max(2, h) }
})

let dragging = false

function onPointerDown(e: PointerEvent) {
  dragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const f = fit.value
  emit('center', (e.clientX - r.left - f.tx) / f.scale, (e.clientY - r.top - f.ty) / f.scale)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const f = fit.value
  emit('center', (e.clientX - r.left - f.tx) / f.scale, (e.clientY - r.top - f.ty) / f.scale)
}

function onPointerUp(e: PointerEvent) {
  dragging = false
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* 已释放 */
  }
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
  emit('zoom', (props.view.k || 1) * factor)
}
</script>
