<template>
  <!-- 缩略图（计划书 T3.3）：右上角 164×112，可拖拽平移、滚轮缩放 -->
  <div
    class="relative rounded-[10px] border border-line bg-surface/95 backdrop-blur shadow-ds1 overflow-hidden select-none touch-none"
    :style="{ width: WIDTH + 'px', height: HEIGHT + 'px' }"
    data-testid="graph-minimap"
    :aria-label="`图谱缩略图，共 ${nodes.length} 个节点`"
    role="img"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel.prevent="onWheel"
  >
    <svg :width="WIDTH" :height="HEIGHT" class="block">
      <g :transform="`translate(${fit.tx},${fit.ty}) scale(${fit.scale})`">
        <circle
          v-for="n in dots"
          :key="n.id"
          :cx="n.x"
          :cy="n.y"
          :r="n.r / fit.scale"
          fill="var(--ink-3)"
          opacity="0.55"
        />
        <rect
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
import { RENDER_TIERS } from '~/lib/graph-constants'

export interface MinimapNode {
  id: string
  x: number
  y: number
  r: number
  degree: number
}

const props = defineProps<{
  nodes: MinimapNode[]
  canvas: { w: number; h: number }
  view: { x: number; y: number; k: number }
}>()

const emit = defineEmits<{
  (e: 'center', gx: number, gy: number): void
  (e: 'zoom', k: number): void
}>()

const WIDTH = 164
const HEIGHT = 112
const PAD = 6

/** 缩略图只画度数 Top 200（与主画布 >600 时的收敛口径一致） */
const dots = computed<MinimapNode[]>(() => {
  if (props.nodes.length <= RENDER_TIERS.canvas) return props.nodes
  return [...props.nodes]
    .sort((a, b) => b.degree - a.degree)
    .slice(0, RENDER_TIERS.topN)
})

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
  const scale = Math.min((WIDTH - PAD * 2) / w, (HEIGHT - PAD * 2) / h)
  const tx = (WIDTH - w * scale) / 2 - b.minX * scale
  const ty = (HEIGHT - h * scale) / 2 - b.minY * scale
  return { scale, tx, ty }
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
