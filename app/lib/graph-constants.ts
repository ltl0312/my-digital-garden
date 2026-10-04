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

/**
 * 位置存档的「可信覆盖率」。
 *
 * 需求（m00991 第 2 条）：图谱位置要自动保存，下次打开按上次的样子还原，
 * 只有手动点「重置位置」才重新排布。力导向仿真默认会 alpha=1 起跑、
 * 把存档位置只当成**起点**再算一遍，所以必须显式判断「这份存档能不能直接信」：
 * 存档里至少这么大比例的节点有坐标时，就静态还原、不点火。
 * 低于这个比例（例如 vault 里一次性新增了大量笔记）才重跑布局。
 */
export const GRAPH_RESTORE_MIN_RATIO = 0.6

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
  baseWidth: 1.5,
  focusWidth: 2.6,
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

/**
 * 滑杆范围（渲染控制面板用）。
 * 范围刻意留宽：既要能压到几乎看不见（排查用），也要能拉到很夸张（小屏/演示用）。
 */
export const TUNING_RANGES = {
  nodeScale: { min: 0.3, max: 3, step: 0.05 },
  edgeWidth: { min: 0.2, max: 5, step: 0.1 },
  centerStrength: { min: 0, max: 2, step: 0.05 },
  chargeStrength: { min: 0.1, max: 6, step: 0.1 },
  linkStrength: { min: 0, max: 4, step: 0.1 },
  linkDistance: { min: 0.2, max: 5, step: 0.1 },
  focusRepel: { min: 1, max: 10, step: 0.1 }
} as const

/** 中心力滑杆值 → d3 forceX/forceY strength 的换算系数（d3 默认 0.1） */
export const CENTER_FORCE_SCALE = 0.25

/** 标签最多同时标注多少个（防止小屏糊成一片；聚焦时不受此限） */
export const MAX_LABELS = 160

/** localStorage：节点自定义颜色（节点 id → CSS 颜色），与领域配色互不干扰 */
export const NODE_COLOR_KEY = 'garden-graph-node-colors'

/**
 * localStorage：节点自定义颜色的**本地缓存**（slug → CSS 颜色）。
 * 权威数据在服务端（`/api/graph/colors`，按访问密钥隔离，见 prisma GraphColor）；
 * 这份缓存只为了让图谱在请求回来之前先按上次的颜色画出来，不闪白。
 * 键从 id 换成 slug：id 是重建库会变的 uuid，slug 才是笔记的稳定身份。
 */
export const NODE_COLOR_CACHE_KEY = 'garden-graph-colors-v2'

/**
 * localStorage：颜色规则的**本地缓存**（首帧用）。
 * 权威数据在服务端 `/api/graph/color-rules`（按访问密钥隔离，见 prisma GraphColorRules）。
 */
export const RULE_CACHE_KEY = 'garden-graph-color-rules-v1'

/** 规则里「文章内容 / 笔记属性」要问服务端，多个规则合并成一次防抖请求 */
export const RULE_MATCH_DEBOUNCE_MS = 350
/** 服务端匹配一次最多回多少 id（图谱上限约 600 节点，留足冗余） */
export const RULE_MATCH_LIMIT = 5000

/** 颜色规则里「文章内容」的匹配值至少要有几个字符才发请求（1 个字符命中太宽，没意义） */
export const RULE_MIN_VALUE_LENGTH = 1

/** 右键「设置颜色」色板：按色相排布，亮暗两套主题下都有足够对比度 */
export const NODE_COLOR_PALETTE = [
  '#E5484D', '#E8730C', '#D4A017', '#46A758', '#12A594',
  '#0090FF', '#3E63DD', '#8E4EC6', '#D6409F', '#8B8D98'
]

/**
 * 缩略图几何（A11）。点径按**屏幕像素**给，绘制时再除以 fit.scale，
 * 否则会拿主画布的图坐标半径当屏幕半径用，200 个点直接把 164×112 糊成一片灰。
 */
export const MINIMAP = {
  width: 164,
  height: 112,
  pad: 6,
  dotMin: 1.4,
  dotMax: 3.4,
  edgeOpacity: 0.3,
  maxEdges: 700
} as const

/**
 * 右键菜单**估算**尺寸（仅用于首帧贴边避让）。菜单里现在有取色控件，高度不再是常数，
 * 组件挂载后会实测 `offsetHeight` 覆盖这个值，这里给一个偏大的初值免得首帧闪出容器。
 */
export const CONTEXT_MENU = { width: 240, height: 430 } as const

/** 颜色输入框不透明度的可调区间（百分比）：低于 5% 的颜色在图上基本等于消失 */
export const COLOR_ALPHA_MIN_PCT = 5
export const COLOR_ALPHA_MAX_PCT = 100
