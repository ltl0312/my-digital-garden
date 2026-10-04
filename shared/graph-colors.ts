// 图谱节点自定义颜色的**共享校验规则**（服务端与前端同源，只此一份）。
//
// 为什么要有白名单：颜色值最终会被 d3 直接写进 SVG `fill` / canvas `fillStyle`。
// 存进 DB 的值经 `/api/graph/colors` 回灌到浏览器，若不加限制，手改请求就能把
// 任意字符串塞进 DOM 属性。只放行能直接当颜色用的字面量。

/**
 * 能直接喂给 canvas `fillStyle` / SVG `fill` 的颜色字面量。
 *
 * 除了传统的 `#rgb` / `#rrggbb` / `rgb(a)` / `hsl(a)` 逗号写法，这里也放行 CSS Color 4
 * 的**空格 + 斜杠**写法（`rgb(255 0 0 / 50%)`、`hsl(160 56% 40%)`）——`domainColor()`
 * 生成的就是后者。关键约束是不允许出现 `;` `"` `<` `{` `}` 之类能逃出属性值的字符。
 */
export const CSS_COLOR_RE = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[0-9.]+%?[\s,]+[0-9.]+%?[\s,]+[0-9.]+%?(?:\s*[,/]\s*[0-9.]+%?)?\s*\)|hsla?\(\s*[0-9.]+(?:deg|grad|rad|turn)?[\s,]+[0-9.]+%[\s,]+[0-9.]+%(?:\s*[,/]\s*[0-9.]+%?)?\s*\)|var\(--[\w-]+\))$/i

/** 值是否为安全的颜色字面量（自动 trim） */
export const isSafeColor = (v: unknown): v is string => typeof v === 'string' && CSS_COLOR_RE.test(v.trim())

/** 归一化：安全则返回 trim 后的值，否则 null */
export const normalizeColor = (v: unknown): string | null => {
  if (!isSafeColor(v)) return null
  return (v as string).trim()
}

// ---------------------------------------------------------------
// 任意颜色的解析与格式化
// ---------------------------------------------------------------
//
// 需求：自定义颜色不能只有那 10 个预设色，要能用任意颜色、并且能用 rgba 表达半透明。
// 浏览器原生 `<input type="color">` 只认 `#rrggbb`，所以「透明度」必须由我们自己的
// 滑杆承担，最终拼成 `rgba(r, g, b, a)` 落库。下面这组纯函数就是「输入 → 分量 → 规范
// 字符串」的往返，前端与服务端共用一份（服务端只在白名单校验时用到正则）。

export interface Rgba { r: number; g: number; b: number; a: number }

const clampNum = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0')

/** hsl 色相 → rgb 分量的标准换算 */
function hue2rgb(p: number, q: number, t0: number): number {
  let t = t0
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

const num = (v: string | undefined): number => (v == null ? Number.NaN : Number.parseFloat(v))

const alphaOf = (v: string | undefined): number => {
  if (v == null) return 1
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n)) return Number.NaN
  return clampNum(v.trim().endsWith('%') ? n / 100 : n, 0, 1)
}

/**
 * 把颜色字面量解析成 rgba 分量。
 * 认不出来的写法（`var(--x)`、拼错的函数、空值）返回 null，调用方自行回落。
 */
export function parseColor(input: unknown): Rgba | null {
  if (typeof input !== 'string') return null
  const v = input.trim()
  if (!v) return null

  const hexMatch = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v)
  if (hexMatch) {
    const h = hexMatch[1] ?? ''
    const one = (s: string): number => Number.parseInt(s.length === 1 ? s + s : s, 16)
    if (h.length <= 4) {
      return {
        r: one(h[0] ?? ''),
        g: one(h[1] ?? ''),
        b: one(h[2] ?? ''),
        a: h.length === 4 ? one(h[3] ?? '') / 255 : 1
      }
    }
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1
    }
  }

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(v)
  if (!fn) return null
  const kind = (fn[1] ?? '').toLowerCase()
  const parts = (fn[2] ?? '').split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return null
  const a = alphaOf(parts[3])
  if (!Number.isFinite(a)) return null

  if (kind.startsWith('rgb')) {
    const chan = (s: string | undefined): number => {
      const n = num(s)
      if (!Number.isFinite(n)) return Number.NaN
      return clampNum((s ?? '').trim().endsWith('%') ? (n / 100) * 255 : n, 0, 255)
    }
    const r = chan(parts[0])
    const g = chan(parts[1])
    const b = chan(parts[2])
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
    return { r, g, b, a }
  }

  const hueDeg = num(parts[0])
  const sat = num(parts[1])
  const lig = num(parts[2])
  if (!Number.isFinite(hueDeg) || !Number.isFinite(sat) || !Number.isFinite(lig)) return null
  const h = (((hueDeg % 360) + 360) % 360) / 360
  const s = clampNum(sat / 100, 0, 1)
  const l = clampNum(lig / 100, 0, 1)
  if (s === 0) {
    const grey = Math.round(l * 255)
    return { r: grey, g: grey, b: grey, a }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    a
  }
}

/**
 * 分量 → 规范字符串。**不透明写成 `#RRGGBB`（大写，与预设色板一致），
 * 半透明写成 `rgba(r, g, b, a)`** —— 只在真的需要透明度时才引入 rgba，
 * 免得把满屏原本简洁的 hex 全改写成函数式写法。
 */
export function formatColor(c: Rgba): string {
  const r = Math.round(clampNum(c.r, 0, 255))
  const g = Math.round(clampNum(c.g, 0, 255))
  const b = Math.round(clampNum(c.b, 0, 255))
  const a = clampNum(c.a, 0, 1)
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase()
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`
}

/** 取 `#rrggbb`（原生颜色输入框只认这个）；解析不了时回落到 fallback */
export function toHex6(input: unknown, fallback = '#8B8D98'): string {
  const c = parseColor(input)
  if (!c) return fallback
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase()
}

/** 保留 rgb、替换透明度；解析不了返回 null */
export function withAlpha(input: unknown, alpha: number): string | null {
  const c = parseColor(input)
  if (!c) return null
  return formatColor({ ...c, a: alpha })
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
