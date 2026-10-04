// 图谱布局算法（计划书 T3.2）
// 纯函数：给定节点/边与画布尺寸，算出每个节点的目标坐标，不碰 DOM、不读全局状态。
// 四种布局：force（力导向，由 GraphView 接手跑实时仿真）/ tree（dirPath 层次）/ radial（入度中心 + 跳数分层）/ timeline（更新时间 × 领域泳道）。
import type { LayoutName } from './graph-types'

export interface LayoutNodeInput {
  id: string
  dirPath: string
  domain: string
  updatedAt: string | null
  inDegree: number
  degree: number
}

export interface LayoutEdgeInput {
  source: string
  target: string
}

export interface LayoutContext {
  nodes: LayoutNodeInput[]
  edges: LayoutEdgeInput[]
  width: number
  height: number
  /** 当前坐标：力导向的初值 / 其余布局的补间起点 */
  prev?: Record<string, [number, number]>
  /** 用户拖拽固定的坐标：任何布局都必须尊重，算完覆盖回去 */
  pinned?: Record<string, [number, number]>
}

export interface LayoutResult {
  positions: Record<string, [number, number]>
  /** true = 还需要 GraphView 跑实时力仿真（仅 force） */
  live: boolean
}

/** 力导向参数（T3.2 指定值），GraphView 建 simulation 时直接用 */
export const FORCE_PARAMS = {
  linkDistance: 120,
  chargeStrength: -320,
  collidePadding: 10,
  alphaDecay: 0.032,
  velocityDecay: 0.42,
  /** 力导向的初始播种半径（相对画布短边） */
  seedRadius: 0.34
} as const

/** 各布局的间距参数，集中定义便于调优 */
export const LAYOUT_TUNING = {
  tree: { colGap: 210, rowGap: 40, padding: 72 },
  radial: { ringGap: 150, padding: 76, startAngle: -Math.PI / 2, goldenAngle: 2.399963229728653 },
  timeline: { padX: 84, laneGap: 96, jitter: 16 },
  fit: { padding: 64 }
} as const

type Pos = [number, number]

/** 把坐标整体缩放/平移到画布内（保持长宽比，留 padding） */
function fitToViewport(
  positions: Record<string, Pos>,
  width: number,
  height: number,
  padding: number
): Record<string, Pos> {
  const ids = Object.keys(positions)
  if (!ids.length) return positions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const id of ids) {
    const p = positions[id]!
    if (p[0] < minX) minX = p[0]
    if (p[0] > maxX) maxX = p[0]
    if (p[1] < minY) minY = p[1]
    if (p[1] > maxY) maxY = p[1]
  }
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const availW = Math.max(1, width - padding * 2)
  const availH = Math.max(1, height - padding * 2)
  const scale = Math.min(availW / spanX, availH / spanY, 1.4)
  const offX = (width - spanX * scale) / 2 - minX * scale
  const offY = (height - spanY * scale) / 2 - minY * scale
  const out: Record<string, Pos> = {}
  for (const id of ids) {
    const p = positions[id]!
    out[id] = [p[0] * scale + offX, p[1] * scale + offY]
  }
  return out
}

/** 力导向：只做确定性播种（黄金角螺旋 + 领域分簇），实时仿真交给 GraphView */
function computeForce(ctx: LayoutContext): LayoutResult {
  const { nodes, width, height, prev } = ctx
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * FORCE_PARAMS.seedRadius
  const positions: Record<string, Pos> = {}
  nodes.forEach((n, i) => {
    const p = prev?.[n.id]
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      positions[n.id] = [p[0], p[1]]
      return
    }
    const t = (i + 1) * LAYOUT_TUNING.radial.goldenAngle
    const r = radius * Math.sqrt((i + 1) / Math.max(1, nodes.length))
    positions[n.id] = [cx + r * Math.cos(t), cy + r * Math.sin(t)]
  })
  return { positions, live: true }
}

/** 层次树：按 dirPath 分层（只到目录级），左→右展开，同级按名称排序 */
function computeTree(ctx: LayoutContext): LayoutResult {
  const { nodes, width, height } = ctx
  const { colGap, rowGap, padding } = LAYOUT_TUNING.tree

  interface DirNode {
    name: string
    children: Map<string, DirNode>
    leaves: string[]
  }
  const root: DirNode = { name: '', children: new Map(), leaves: [] }

  for (const n of nodes) {
    const segs = (n.dirPath || '').split(' / ').map(s => s.trim()).filter(Boolean)
    let cur = root
    for (const seg of segs) {
      let next = cur.children.get(seg)
      if (!next) {
        next = { name: seg, children: new Map(), leaves: [] }
        cur.children.set(seg, next)
      }
      cur = next
    }
    cur.leaves.push(n.id)
  }

  const positions: Record<string, Pos> = {}
  let row = 0
  const walk = (node: DirNode, depth: number) => {
    const names = [...node.children.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    for (const name of names) walk(node.children.get(name)!, depth + 1)
    const sorted = [...node.leaves].sort()
    for (const id of sorted) {
      positions[id] = [padding + depth * colGap, padding + row * rowGap]
      row++
    }
  }
  walk(root, 0)

  return { positions: fitToViewport(positions, width, height, LAYOUT_TUNING.fit.padding), live: false }
}

/** 径向：以入度最大的节点为圆心，按 BFS 跳数分层 */
function computeRadial(ctx: LayoutContext): LayoutResult {
  const { nodes, edges, width, height } = ctx
  const { ringGap, padding, startAngle, goldenAngle } = LAYOUT_TUNING.radial
  if (!nodes.length) return { positions: {}, live: false }

  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (e.source === e.target) continue
    const a = adj.get(e.source); if (a) a.push(e.target); else adj.set(e.source, [e.target])
    const b = adj.get(e.target); if (b) b.push(e.source); else adj.set(e.target, [e.source])
  }

  const byId = new Map(nodes.map(n => [n.id, n]))
  let centerId = nodes[0]!.id
  let best = -1
  for (const n of nodes) {
    if (n.inDegree > best || (n.inDegree === best && n.degree > (byId.get(centerId)?.degree ?? -1))) {
      best = n.inDegree
      centerId = n.id
    }
  }

  const layer = new Map<string, number>([[centerId, 0]])
  let frontier = [centerId]
  let depth = 0
  while (frontier.length) {
    const next: string[] = []
    for (const cur of frontier) {
      for (const nb of adj.get(cur) || []) {
        if (layer.has(nb)) continue
        layer.set(nb, depth + 1)
        next.push(nb)
      }
    }
    frontier = next
    depth++
  }

  // 不可达节点排到最外圈
  const orphans = nodes.filter(n => !layer.has(n.id)).map(n => n.id)
  if (orphans.length) {
    const outer = (Math.max(0, ...[...layer.values()]) || 0) + 1
    for (const id of orphans) layer.set(id, outer)
  }

  const rings = new Map<number, string[]>()
  for (const [id, l] of layer) {
    const arr = rings.get(l)
    if (arr) arr.push(id)
    else rings.set(l, [id])
  }

  const maxLayer = Math.max(...rings.keys(), 1)
  const maxRadius = padding + maxLayer * ringGap
  const scale = Math.min(1, (Math.min(width, height) / 2 - padding) / Math.max(1, maxLayer * ringGap))
  const cx = width / 2
  const cy = height / 2

  const positions: Record<string, Pos> = {}
  for (const [l, ids] of rings) {
    ids.sort()
    if (l === 0) {
      for (const id of ids) positions[id] = [cx, cy]
      continue
    }
    const r = (padding + l * ringGap) * scale
    const step = (Math.PI * 2) / ids.length
    const offset = startAngle + l * goldenAngle
    ids.forEach((id, i) => {
      const a = offset + i * step
      positions[id] = [cx + r * Math.cos(a), cy + r * Math.sin(a)]
    })
  }
  void maxRadius

  return { positions: fitToViewport(positions, width, height, LAYOUT_TUNING.fit.padding), live: false }
}

/** 时间轴：x = updatedAt 线性映射，y = 领域泳道 */
function computeTimeline(ctx: LayoutContext): LayoutResult {
  const { nodes, width, height } = ctx
  const { padX, laneGap, jitter } = LAYOUT_TUNING.timeline
  if (!nodes.length) return { positions: {}, live: false }

  const laneCount = new Map<string, number>()
  for (const n of nodes) laneCount.set(n.domain, (laneCount.get(n.domain) || 0) + 1)
  const lanes = [...laneCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([name]) => name)
  const laneIndex = new Map(lanes.map((name, i) => [name, i]))

  const times = nodes.map(n => (n.updatedAt ? Date.parse(n.updatedAt) : NaN)).filter(t => Number.isFinite(t))
  const minT = times.length ? Math.min(...times) : 0
  const maxT = times.length ? Math.max(...times) : 0
  const spanT = Math.max(1, maxT - minT)
  const usableW = Math.max(1, width - padX * 2)

  const laneSeen = new Map<number, number>()
  const positions: Record<string, Pos> = {}
  const cy = height / 2
  for (const n of nodes) {
    const t = n.updatedAt ? Date.parse(n.updatedAt) : NaN
    const ratio = Number.isFinite(t) ? (t - minT) / spanT : 0
    const li = laneIndex.get(n.domain) ?? 0
    const seen = laneSeen.get(li) || 0
    laneSeen.set(li, seen + 1)
    const jitterY = ((seen % 3) - 1) * jitter
    positions[n.id] = [
      padX + ratio * usableW,
      cy + (li - (lanes.length - 1) / 2) * laneGap + jitterY
    ]
  }

  return { positions: fitToViewport(positions, width, height, LAYOUT_TUNING.fit.padding), live: false }
}

/**
 * 计算目标布局。返回的坐标已经过视口适配；pinned 节点最后覆盖回去，
 * 保证「固定状态」在任何布局切换下都不丢。
 */
export function computeLayout(name: LayoutName, ctx: LayoutContext): LayoutResult {
  let result: LayoutResult
  switch (name) {
    case 'tree':
      result = computeTree(ctx)
      break
    case 'radial':
      result = computeRadial(ctx)
      break
    case 'timeline':
      result = computeTimeline(ctx)
      break
    case 'force':
    default:
      result = computeForce(ctx)
      break
  }
  if (ctx.pinned) {
    for (const [id, p] of Object.entries(ctx.pinned)) {
      if (result.positions[id]) result.positions[id] = [p[0], p[1]]
    }
  }
  return result
}
