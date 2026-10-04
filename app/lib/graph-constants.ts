// 知识图谱的集中常量：渲染阈值 / 交互尺寸 / 动效时长 / 持久化键。
// 计划书硬性提醒 5：阈值、边长、路径长度等一律集中定义，不要散落字面量。
import type { GraphTuning, LabelMode, LayoutName } from './graph-types'

/** 渲染分级阈值（计划书 T3.1 / A10） */
export const RENDER_TIERS = { svg: 150, canvas: 600, topN: 200 } as const

/**
 * 三区布局所需的最小**容器**宽度（不是视口宽度）。
 * 左栏 240 + 右栏 288 + 画布 232（缩略图 164 + 左右各 8 留白 + 一点余量）。
 * 视口 ≥1024 但外壳侧边栏展开时，图谱页可用宽度可能只有 ~640px，
 * 此时若仍强上三区，画布只剩百余像素、贴边浮层（缩略图 / 缩放条）会被裁掉。
 */
export const MIN_THREE_PANE_WIDTH = 760

/** localStorage：图谱设置（v3 起加入 layout，结构变更故 bump） */
export const GRAPH_SETTINGS_KEY = 'garden-graph-settings-v3'
/** localStorage：图谱状态（节点坐标 / 缩放 / 固定集合 / 布局 / 筛选） */
export const GRAPH_STATE_KEY = 'garden-graph-state'

/** 成熟度：展示顺序（常青 → 成长 → 幼苗）与文案/颜色 */
export const MATURITY_ORDER = ['EVERGREEN', 'GROWING', 'SEEDLING'] as const
export const MATURITY_LABEL: Record<string, string> = {
  EVERGREEN: '常青',
  GROWING: '成长',
  SEEDLING: '幼苗'
}
export const MATURITY_COLORS: Record<string, string> = {
  SEEDLING: 'hsl(38 62% 46%)',
  GROWING: 'hsl(198 60% 44%)',
  EVERGREEN: 'hsl(160 56% 40%)'
}

/** 标签着色的备用色板（标签模式下新标签按序取色） */
export const TAG_PALETTE = [
  '#16a34a', '#0284c7', '#9333ea', '#8C6D46',
  '#B87A8C', '#7A8CB8', '#8CB05B', '#B8A05B'
]

/** 关系类型（显式链接 / 标签共有） */
export const EDGE_KINDS = ['link', 'tag'] as const
export const EDGE_KIND_LABEL: Record<string, string> = { link: '显式链接', tag: '标签共有' }

/** 连线样式：常态 / 邻域内加粗 / 邻域外降透明度 */
export const EDGE_STYLE = {
  baseWidth: 1.2,
  focusWidth: 2.4,
  dimOpacity: 0.12,
  dimTransitionMs: 120
} as const

/** 聚焦高亮（计划书 T2.5 / A3） */
export const FOCUS_STYLE = {
  nodeStrokeWidth: 2.5,
  nodeBaseStrokeWidth: 2,
  isolatedStrokeWidth: 1.5
} as const

/** 缩放（计划书 T3.4）。minNarrow 是**画布宽度** < 768 时的下限，与视口断点 BP 无关。 */
export const ZOOM = {
  minWide: 0.2,
  minNarrow: 0.34,
  narrowCanvasWidth: 768,
  max: 4,
  fitMax: 2.4,
  fitPad: 96,
  buttonStep: 1.35,
  transitionMs: 220,
  fitTransitionMs: 320
} as const

/** 布局切换补间时长（计划书 T3.2） */
export const LAYOUT_TRANSITION_MS = 400

/** 交互阈值 */
export const DRAG_CLICK_THRESHOLD_PX = 4
export const TOUCH_HIT_RADIUS = 24
export const PIN_DOT_RADIUS = 8

/** 四种布局的展示名（工具条与设置共用） */
export const LAYOUT_OPTIONS: { value: LayoutName; label: string; hint: string }[] = [
  { value: 'force', label: '力导向', hint: '按连接关系自然聚拢' },
  { value: 'tree', label: '层次树', hint: '按 vault 目录层级展开' },
  { value: 'radial', label: '径向', hint: '以枢纽笔记为圆心按跳数分层' },
  { value: 'timeline', label: '时间轴', hint: '横轴=最近更新，纵轴=领域泳道' }
]

/** 搜索面板的分组顺序（计划书 T2.4） */
export const SEARCH_GROUPS = ['notes', 'tags', 'domains', 'commands'] as const
export const SEARCH_GROUP_LABEL: Record<string, string> = {
  notes: '笔记',
  tags: '标签',
  domains: '领域',
  commands: '命令'
}

/**
 * MOC（Map of Content）节点判定：标题以 `MOC` 开头，如「MOC - 前端」「MOC」。
 * `\b` 保证 `MOCA` 这类词不会被误判。vault 里现有 35 个 `MOC - XXX.md`。
 */
export const MOC_TITLE_RE = /^MOC\b/i
export const isMocTitle = (title: string) => MOC_TITLE_RE.test(title.trim())

/** 标签显示模式（控制面板「显示」区） */
export const LABEL_MODES: LabelMode[] = ['moc', 'all', 'off']
export const LABEL_MODE_LABEL: Record<LabelMode, string> = {
  moc: '仅 MOC',
  all: '全部',
  off: '关闭'
}
export const LABEL_MODE_HINT: Record<LabelMode, string> = {
  moc: '只标注 MOC 节点；聚焦时改为标注被聚焦的节点',
  all: '尽量标注所有节点（上限 160 个，避免糊成一片）',
  off: '只在选中或悬停时标注'
}

/**
 * 控制面板默认值。刻意让所有系数 = 1、中心力 = 0，
 * 这样默认观感与加入控制面板之前完全一致；只有聚焦斥力默认 > 1（聚焦时拉开距离）。
 */
export const GRAPH_TUNING_DEFAULTS: GraphTuning = {
  nodeScale: 1,
  edgeWidth: 1,
  centerStrength: 0,
  chargeStrength: 1,
  linkStrength: 1,
  linkDistance: 1,
  focusRepel: 2.4
}

/** 滑杆范围（渲染控制面板用） */
export const TUNING_RANGES = {
  nodeScale: { min: 0.6, max: 1.8, step: 0.05 },
  edgeWidth: { min: 0.4, max: 2.4, step: 0.1 },
  centerStrength: { min: 0, max: 1, step: 0.05 },
  chargeStrength: { min: 0.2, max: 3, step: 0.1 },
  linkStrength: { min: 0, max: 2, step: 0.1 },
  linkDistance: { min: 0.4, max: 2.5, step: 0.1 },
  focusRepel: { min: 1, max: 5, step: 0.1 }
} as const

/** 中心力滑杆值（0–1）→ d3 forceX/forceY strength 的换算系数（d3 默认 0.1） */
export const CENTER_FORCE_SCALE = 0.25

/** 标签最多同时标注多少个（防止小屏糊成一片） */
export const MAX_LABELS = 160
