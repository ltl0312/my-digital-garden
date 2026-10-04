// garden-graph-state 的读写（计划书 T3.4 第 6 条）
// 同一份状态由两处写入：GraphView（pos / zoom / pinned / layout）与 useGraphFilter（filter）。
// 因此统一走 patchGraphState 做**字段级合并**，避免任一方整对象覆写把对方的字段清掉。
import { GRAPH_SETTINGS_KEY, GRAPH_STATE_KEY, GRAPH_TUNING_DEFAULTS } from './graph-constants'
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
