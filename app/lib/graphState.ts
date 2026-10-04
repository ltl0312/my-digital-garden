// garden-graph-state 的读写（计划书 T3.4 第 6 条）
// 同一份状态由两处写入：GraphView（pos / zoom / pinned / layout）与 useGraphFilter（filter）。
// 因此统一走 patchGraphState 做**字段级合并**，避免任一方整对象覆写把对方的字段清掉。
import { GRAPH_SETTINGS_KEY, GRAPH_STATE_KEY, GRAPH_TUNING_DEFAULTS, NODE_COLOR_CACHE_KEY, NODE_COLOR_KEY } from './graph-constants'
import { normalizeColor } from '#shared/graph-colors'
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
//
// 权威数据在服务端（`/api/graph/colors`，按访问密钥隔离，见 prisma GraphColor）。
// 这里只做两件事：
//   1. 读写本地缓存（`garden-graph-colors-v2`，slug → 颜色），让图谱先按上次的颜色画出来；
//   2. 把旧版 id 键的 `garden-graph-node-colors` 一次性迁移成 slug 键。
//
// 颜色值的白名单校验规则与**服务端同一份**（shared/graph-colors.ts）——
// 这条规则同时守着「本地手改」和「服务端回灌」两条入口，必须只有一处定义。

/** 本地缓存（slug → CSS 颜色） */
export function readNodeColorsCache(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(NODE_COLOR_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [slug, v] of Object.entries(parsed as Record<string, unknown>)) {
      const c = normalizeColor(v)
      if (slug && c) out[slug] = c
    }
    return out
  } catch {
    return {}
  }
}

export function writeNodeColorsCache(map: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(NODE_COLOR_CACHE_KEY, JSON.stringify(map))
  } catch {
    /* 隐私模式 / 配额满：忽略，服务端仍是权威 */
  }
}

export function clearNodeColorsCache(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(NODE_COLOR_CACHE_KEY)
  } catch {
    /* 同上 */
  }
}

/**
 * 旧版（id 键）的本地颜色表。
 * 只读不写——读到之后由 useGraphColors 用图谱数据把 id 映射成 slug 推到服务端，然后清掉。
 */
export function readLegacyNodeColors(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(NODE_COLOR_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const c = normalizeColor(v)
      if (id && c) out[id] = c
    }
    return out
  } catch {
    return {}
  }
}

export function clearLegacyNodeColors(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(NODE_COLOR_KEY)
  } catch {
    /* 同上 */
  }
}

