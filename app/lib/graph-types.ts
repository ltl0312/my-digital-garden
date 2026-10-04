// 知识图谱的共享类型（前端）。服务端对应结构见 server/api/notes/graph.get.ts，
// 两边字段必须同步变更。

/** 边的语义：link = 显式 [[链接]]；tag = 标签共有（同一非空标签且无显式链接） */
export type EdgeKind = 'link' | 'tag'

export interface GraphNode {
  id: string
  title: string
  slug: string
  maturity: string
  /** 首个标签（兼容既有调用点） */
  primaryTag: string | null
  /** 全部标签名 */
  tags: string[]
  /** 由 slug 派生的领域名（解析不出时为「其他」） */
  domain: string
  /** vault 内相对目录路径 */
  dirPath: string
  /** 显式链接入度 */
  inDegree: number
  /** 显式链接出度 */
  outDegree: number
  /** ISO 字符串 */
  updatedAt: string
  readingTime: number
  summary: string | null
}

export interface GraphEdge {
  source: string
  target: string
  kind: EdgeKind
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** 可见范围：全图 / 选中节点的 2 跳邻居 / 两节点最短路径 */
export type ScopeMode = 'all' | 'neighbors' | 'path'

/** 四种布局算法 */
export type LayoutName = 'force' | 'tree' | 'radial' | 'timeline'

/** 标签显示模式：moc = 只显示 MOC 节点名（默认）/ all = 全部 / off = 关闭 */
export type LabelMode = 'moc' | 'all' | 'off'

/** 控制面板参数（Obsidian 风格：显示 + 力导向），持久化在 garden-graph-settings-v3 */
export interface GraphTuning {
  /** 节点半径系数 */
  nodeScale: number
  /** 连线粗细系数 */
  edgeWidth: number
  /** 中心力（d3 forceX/forceY 的 strength 系数），0 = 关闭 */
  centerStrength: number
  /** 排斥力系数 */
  chargeStrength: number
  /** 连接力系数 */
  linkStrength: number
  /** 连接距离系数 */
  linkDistance: number
  /** 聚焦时被聚焦节点之间的排斥力倍数 */
  focusRepel: number
}

/** 筛选状态（持久化在 garden-graph-state.filter） */
export interface GraphFilterState {
  scope: ScopeMode
  /** 选中的领域名；空数组 = 不按领域过滤 */
  domains: string[]
  /** 选中的成熟度；空数组 = 不按成熟度过滤 */
  maturities: string[]
  /** 选中的标签（来自节点详情或搜索面板的「标签」组）；空数组 = 不按标签过滤 */
  tags: string[]
  /** 启用的关系类型；至少保留一种 */
  edgeKinds: EdgeKind[]
  /** 标签显示模式 */
  labelMode: LabelMode
  /** 显示孤立节点 */
  showIsolated: boolean
}

export interface GraphStats {
  nodeCount: number
  edgeCount: number
  linkCount: number
  tagEdgeCount: number
  isolatedCount: number
  domainCount: number
  tagCount: number
}
