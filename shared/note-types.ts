// 「类型」与「成熟度」两条分类轴的唯一份。
// 谁在用：server/api/overview.get.ts（仪表盘计数）、app/pages/index.vue（卡片）、
// app/pages/browse.vue（分类页标题）、server/api/notes/index.get.ts（?type= 筛选）。
// 单独成文件而不是塞进 shared/domain.ts：那条轴是「领域」，这条是「笔记类型」，两者的
// 口径与数据来源完全不同（领域=路径派生，类型=type/* 标签命名空间）。

/** type/* 标签命名空间；类型轴的取值就是它后面那一段 */
export const TYPE_NAMESPACE = 'type/'

/** 没有 type/* 标签的笔记归到这一桶里（不是标签，是一个筛选口径） */
export const UNTYPED = '未分类'

/** 已知类型的展示顺序；不在此列的类型标签按数量排在后面 */
export const TYPE_ORDER = ['笔记', '教程', 'MOC', '素材']

/** 从标签名取类型值：'type/教程' → '教程'；不在命名空间内返回 null */
export function typeOfTag(name: string): string | null {
  return name.startsWith(TYPE_NAMESPACE) ? name.slice(TYPE_NAMESPACE.length) || null : null
}

/**
 * 类型没有天然色相（不像领域有固定色族），按名称哈希到一组固定色族：
 * 同一个类型在首页卡片与分类页标题上必须同色，所以不能按下标分配（两处顺序不同就会漂）。
 */
export const TYPE_HUE_PALETTE = [
  '--hue-frontend',
  '--hue-cs',
  '--hue-se',
  '--hue-cross',
  '--hue-database',
  '--hue-devops'
]

export function typeHueOf(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973
  return TYPE_HUE_PALETTE[h % TYPE_HUE_PALETTE.length] || '--hue-misc'
}

/** 成熟度枚举与其展示名（顺序即生长顺序：幼苗 → 生长中 → 常青） */
export const MATURITY_ORDER = ['SEEDLING', 'GROWING', 'EVERGREEN']

export const MATURITY_LABEL: Record<string, string> = {
  SEEDLING: '幼苗',
  GROWING: '生长中',
  EVERGREEN: '常青'
}

export function isMaturity(value: string): boolean {
  return MATURITY_ORDER.includes(value)
}
