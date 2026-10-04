// garden-graph-state 的读写（计划书 T3.4 第 6 条）
// 同一份状态由两处写入：GraphView（pos / zoom / pinned / layout）与 useGraphFilter（filter）。
// 因此统一走 patchGraphState 做**字段级合并**，避免任一方整对象覆写把对方的字段清掉。
import { GRAPH_SETTINGS_KEY, GRAPH_STATE_KEY, GRAPH_TUNING_DEFAULTS, NODE_COLOR_KEY } from './graph-constants'
import type { GraphFilterState, GraphTuning, LayoutName } from './graph-types'

/** 节点坐标：[x, y, fx, fy]；fx/fy 为 NaN 表示未固定 */
export type NodePos = [number, number, number, number]

export interface GraphViewState {
  pos?: Record<string, NodePos>
  zoom?: { x: number; y: number; k: number }
  /** 用户拖拽固定（钉住）的节点 id */
  pinned?: string[]
  layout?: LayoutName
  filter?: GraphFilterState
}

export function readGraphState(): GraphViewState {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(GRAPH_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as GraphViewState : {}
  } catch {
    return {}
  }
}

/** 合并写入（只覆盖传入的字段） */
export function patchGraphState(patch: Partial<GraphViewState>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(GRAPH_STATE_KEY, JSON.stringify({ ...readGraphState(), ...patch }))
  } catch {
    /* 隐私模式 / 配额满：忽略，不影响功能 */
  }
}

export function clearGraphState(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(GRAPH_STATE_KEY)
  } catch {
    /* 同上 */
  }
}

/**
 * 控制面板参数（`garden-graph-settings-v3`）。
 * 逐字段校验并回落到默认值：旧版本存过的结构缺字段、或被手改成非数字，
 * 都不能让 NaN 流进 d3 的力参数里（那会让仿真直接崩掉）。
 */
export function readGraphSettings(): GraphTuning {
  const out: GraphTuning = { ...GRAPH_TUNING_DEFAULTS }
  if (typeof localStorage === 'undefined') return out
  try {
    const raw = localStorage.getItem(GRAPH_SETTINGS_KEY)
    if (!raw) return out
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return out
    for (const key of Object.keys(out) as (keyof GraphTuning)[]) {
      const v = (parsed as Record<string, unknown>)[key]
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
    }
  } catch {
    /* 隐私模式 / 坏 JSON：用默认值 */
  }
  return out
}

export function writeGraphSettings(tuning: GraphTuning): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(GRAPH_SETTINGS_KEY, JSON.stringify(tuning))
  } catch {
    /* 同上 */
  }
}

export function clearGraphSettings(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(GRAPH_SETTINGS_KEY)
  } catch {
    /* 同上 */
  }
}

// ---------- 节点自定义颜色 ----------

/**
 * 只接受能直接喂给 canvas `fillStyle` / SVG `fill` 的颜色字面量。
 * 存进去的值最终会被 d3 当作属性写进 DOM，因此不接受 `var(--x)` 之外的任意字符串，
 * 避免手改 localStorage 注入脏值。
 */
const CSS_COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|var\(--[\w-]+\))$/i

/**
 * 节点自定义颜色（`garden-graph-node-colors`）。
 * 与领域配色是叠加关系：命中这里就用这里的，否则回落到 `domainColor(domain)`。
 */
export function readNodeColors(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(NODE_COLOR_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== 'string') continue
      const c = v.trim()
      if (CSS_COLOR_RE.test(c)) out[id] = c
    }
    return out
  } catch {
    return {}
  }
}

export function writeNodeColors(map: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(NODE_COLOR_KEY, JSON.stringify(map))
  } catch {
    /* 隐私模式 / 配额满：忽略 */
  }
}

/** 设置单个节点的自定义颜色；`color` 传 null 表示清除该节点的自定义色 */
export function setNodeColor(id: string, color: string | null): Record<string, string> {
  const map = readNodeColors()
  if (color) map[id] = color
  else delete map[id]
  writeNodeColors(map)
  return map
}

/** 清除全部节点自定义颜色 */
export function clearNodeColors(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(NODE_COLOR_KEY)
  } catch {
    /* 同上 */
  }
}
