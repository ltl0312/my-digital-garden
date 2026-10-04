// 图谱节点自定义颜色的**共享校验规则**（服务端与前端同源，只此一份）。
//
// 为什么要有白名单：颜色值最终会被 d3 直接写进 SVG `fill` / canvas `fillStyle`。
// 存进 DB 的值经 `/api/graph/colors` 回灌到浏览器，若不加限制，手改请求就能把
// 任意字符串塞进 DOM 属性。只放行能直接当颜色用的字面量。

/** 能直接喂给 canvas `fillStyle` / SVG `fill` 的颜色字面量 */
export const CSS_COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|var\(--[\w-]+\))$/i

/** 值是否为安全的颜色字面量（自动 trim） */
export const isSafeColor = (v: unknown): v is string => typeof v === 'string' && CSS_COLOR_RE.test(v.trim())

/** 归一化：安全则返回 trim 后的值，否则 null */
export const normalizeColor = (v: unknown): string | null => {
  if (!isSafeColor(v)) return null
  return (v as string).trim()
}

/**
 * 单个用户最多能存多少条自定义色。
 * 图谱上限约 600 个节点，留足冗余；同时防止有人 PUT 一个几十万键的对象把库撑爆。
 */
export const MAX_NODE_COLORS = 5000

/** slug 长度上限（vault 相对路径，正常远小于此） */
export const MAX_COLOR_SLUG_LENGTH = 512

// ---------------------------------------------------------------
// 颜色规则（ColorRule）
// ---------------------------------------------------------------
//
// 需求（m00991 第 4/5/6 条）：批量改色要能按「文件路径 / 文件名 / tag 标签 /
// 笔记属性 / 文章内容」圈选，而且这些**要记录在案**、可修改、可调优先级；
// 原来写死的「按领域」「按成熟度」配色也搬进同一份列表。
//
// 于是「批量上色」不再是涂一次色，而是**新增一条规则**：
//   手动单节点色（右键，最高优先）→ 规则按数组顺序第一条命中 → 兜底色
// 数组下标即优先级（0 最高），UI 用 ↑↓ 调整，因此服务端只需要整体替换。

/** 规则可以匹配的维度 */
export const COLOR_RULE_FIELDS = [
  'path',
  'filename',
  'tag',
  'property',
  'content',
  'domain',
  'maturity'
] as const
export type ColorRuleField = (typeof COLOR_RULE_FIELDS)[number]

/** 匹配算子 */
export const COLOR_RULE_OPS = ['contains', 'equals'] as const
export type ColorRuleOp = (typeof COLOR_RULE_OPS)[number]

export interface ColorRule {
  /** 客户端生成的稳定 id（同一份列表内唯一） */
  id: string
  enabled: boolean
  field: ColorRuleField
  op: ColorRuleOp
  /** 仅 `field === 'property'` 使用：frontmatter 的键名 */
  key?: string
  value: string
  color: string
  /** 可选的备注名（列表里显示用） */
  label?: string
}

/** 单个用户最多能存多少条规则 */
export const MAX_COLOR_RULES = 200
export const MAX_RULE_ID_LENGTH = 64
export const MAX_RULE_VALUE_LENGTH = 256
export const MAX_RULE_KEY_LENGTH = 64
export const MAX_RULE_LABEL_LENGTH = 64

/**
 * 这些维度没法在前端本地求值，必须由服务端 `/api/notes/graph/match`
 * 解析成「命中了哪些笔记 id」的集合，前端再按 id ∈ set 判定。
 * 其余维度（路径 / 文件名 / 标签 / 领域 / 成熟度）图谱节点上已经有原始数据，本地算更快。
 */
export const SERVER_RULE_FIELDS: ColorRuleField[] = ['content', 'property']
export const isServerRuleField = (f: ColorRuleField): boolean => SERVER_RULE_FIELDS.includes(f)

/** 「领域」「成熟度」是枚举等值，算子只能是 equals */
export const ruleOpsFor = (field: ColorRuleField): readonly ColorRuleOp[] =>
  field === 'domain' || field === 'maturity' ? (['equals'] as const) : COLOR_RULE_OPS

const isField = (v: unknown): v is ColorRuleField =>
  typeof v === 'string' && (COLOR_RULE_FIELDS as readonly string[]).includes(v)

const isOp = (v: unknown): v is ColorRuleOp =>
  typeof v === 'string' && (COLOR_RULE_OPS as readonly string[]).includes(v)

/** 规则 id：只允许字母数字下划线连字符冒号，避免它被当成选择器/属性名用 */
export const normalizeRuleId = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || s.length > MAX_RULE_ID_LENGTH) return null
  return /^[\w:-]+$/.test(s) ? s : null
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * 把任意输入（本地缓存 / 服务端回灌 / 用户手改的请求体）收敛成一条合法规则。
 * 任何一处不合法就整条丢弃——半残的规则比没有规则更糟（会静默染错颜色）。
 */
export const normalizeRule = (raw: unknown): ColorRule | null => {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = normalizeRuleId(r.id)
  const color = normalizeColor(r.color)
  if (!id || !color || !isField(r.field)) return null
  const field = r.field
  const allowed = ruleOpsFor(field)
  const op = isOp(r.op) && allowed.includes(r.op) ? r.op : allowed[0]!
  const value = str(r.value, MAX_RULE_VALUE_LENGTH)
  const key = str(r.key, MAX_RULE_KEY_LENGTH)
  // property 靠 key 选字段，其余维度靠 value 匹配；缺了就没法求值
  if (field === 'property' ? !key : !value) return null
  const label = str(r.label, MAX_RULE_LABEL_LENGTH)
  const out: ColorRule = {
    id,
    enabled: r.enabled !== false,
    field,
    op,
    value,
    color
  }
  if (field === 'property') out.key = key
  if (label) out.label = label
  return out
}

/** 批量归一化：丢弃非法项、按 id 去重、截断到 MAX_COLOR_RULES */
export const normalizeRules = (raw: unknown): ColorRule[] => {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ColorRule[] = []
  for (const item of raw) {
    const rule = normalizeRule(item)
    if (!rule || seen.has(rule.id)) continue
    seen.add(rule.id)
    out.push(rule)
    if (out.length >= MAX_COLOR_RULES) break
  }
  return out
}

/** 规则的可读描述，前端列表与服务端日志共用 */
export const COLOR_RULE_FIELD_LABEL: Record<ColorRuleField, string> = {
  path: '文件路径',
  filename: '文件名',
  tag: 'tag 标签',
  property: '笔记属性',
  content: '文章内容',
  domain: '领域',
  maturity: '成熟度'
}

export const COLOR_RULE_OP_LABEL: Record<ColorRuleOp, string> = {
  contains: '包含',
  equals: '等于'
}
