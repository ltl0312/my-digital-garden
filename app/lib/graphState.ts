// garden-graph-state 的读写（计划书 T3.4 第 6 条）
// 同一份状态由两处写入：GraphView（pos / zoom / pinned / layout）与 useGraphFilter（filter）。
// 因此统一走 patchGraphState 做**字段级合并**，避免任一方整对象覆写把对方的字段清掉。
import { GRAPH_STATE_KEY } from './graph-constants'
import type { GraphFilterState, LayoutName } from './graph-types'

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
