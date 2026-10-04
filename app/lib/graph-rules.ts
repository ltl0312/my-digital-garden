// 颜色规则的**纯求值**。
//
// 刻意做成纯函数（不碰 ref、不碰网络）：渲染层只依赖这里，
// 「颜色到底怎么来的」只有一处逻辑；服务端侧维度（正文 / 笔记属性）的命中集合
// 由外部传进来，所以这个模块可以直接单测。
//
// 优先级（需求 m00991 第 6 条）：
//   手动单节点色（右键设置，最高）→ 规则按数组顺序第一条命中 → 兜底色
// 数组下标就是优先级，UI 用 ↑↓ 调整。

import type { ColorRule, ColorRuleField, ColorRuleOp } from '#shared/graph-colors'
import {
  COLOR_RULE_FIELD_LABEL,
  COLOR_RULE_OP_LABEL,
  isServerRuleField,
  normalizeRules
} from '#shared/graph-colors'

/** 规则求值需要的节点字段（图谱节点是这些字段的超集） */
export interface RuleSubject {
  id: string
  slug: string
  title: string
  tags?: string[]
  domain?: string
  maturity?: string
}

/** 服务端解析出来的命中集合：规则 id → 命中的笔记 id 集合 */
export type RuleMatchSets = Record<string, Set<string>>

const lower = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase() : '')

const test = (haystack: string, needle: string, op: 'contains' | 'equals'): boolean =>
  op === 'equals' ? haystack === needle : haystack.includes(needle)

/**
 * 单条规则是否命中该节点（不判断 enabled，由调用方过滤）。
 * `content` / `property` 两个维度本地没有原始数据，只能查服务端预先算好的集合。
 */
export function ruleMatches(rule: ColorRule, node: RuleSubject, sets: RuleMatchSets): boolean {
  const value = rule.value.toLowerCase()
  switch (rule.field) {
    case 'path':
      return test(lower(node.slug), value, rule.op)
    case 'filename':
      return test(lower(node.title), value, rule.op)
    case 'tag':
      return (node.tags || []).some(t => test(lower(t), value, rule.op))
    case 'domain':
      return test(lower(node.domain), value, rule.op)
    case 'maturity':
      return test(lower(node.maturity), value, rule.op)
    case 'content':
    case 'property':
      return sets[rule.id]?.has(node.id) === true
    default:
      return false
  }
}

/** 按优先级取第一个命中的规则颜色；没有命中的返回 null（由调用方给兜底色） */
export function resolveRuleColor(
  node: RuleSubject,
  rules: ColorRule[],
  sets: RuleMatchSets
): string | null {
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (ruleMatches(rule, node, sets)) return rule.color
  }
  return null
}

/** 一条规则在当前节点集合里命中多少个（面板上显示，让用户知道规则有没有写歪） */
export function countRuleMatches(rule: ColorRule, nodes: RuleSubject[], sets: RuleMatchSets): number {
  let n = 0
  for (const node of nodes) if (ruleMatches(rule, node, sets)) n++
  return n
}

/** 需要服务端解析的规则（正文 / 笔记属性），已过滤掉停用项 */
export const serverRuleList = (rules: ColorRule[]): ColorRule[] =>
  rules.filter(r => r.enabled && isServerRuleField(r.field))

/** 规则的可读描述，列表行与「匹配数」提示共用 */
export function ruleDescription(rule: ColorRule): string {
  const field = COLOR_RULE_FIELD_LABEL[rule.field]
  if (rule.field === 'domain' || rule.field === 'maturity') return `${field} = ${rule.value}`
  const op = COLOR_RULE_OP_LABEL[rule.op]
  if (rule.field === 'property') return `${field} ${rule.key ?? ''} ${op} ${rule.value}`
  return `${field} ${op} ${rule.value}`
}

/** 生成规则 id（`normalizeRuleId` 允许字母数字下划线连字符冒号） */
export const newRuleId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `r-${crypto.randomUUID()}`
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 新建规则表单的默认维度顺序（用户最常用的放前面） */
export const RULE_FIELD_ORDER: ColorRuleField[] = [
  'path',
  'filename',
  'tag',
  'property',
  'content',
  'domain',
  'maturity'
]

// ---------- 新建 / 编辑表单的草稿 ----------

/**
 * 草稿里还没有 id，也还没决定启用状态——这两样在「添加」时才由组合式补上。
 * 草稿存在的唯一目的：让用户**在添加之前**看到这条规则会命中哪些节点。
 */
export interface RuleDraft {
  field: ColorRuleField
  op: ColorRuleOp
  /** 仅 `property` 维度使用 */
  key: string
  value: string
  color: string
}

/** 预览用的固定 id：草稿还没有真 id，但 `ruleMatches` 要靠 id 查服务端命中集合 */
export const PREVIEW_RULE_ID = 'preview'

export const emptyDraft = (color: string): RuleDraft => ({
  field: 'path',
  op: 'contains',
  key: '',
  value: '',
  color
})

/**
 * 草稿 → 可求值的规则。走 `normalizeRules` 而不是手工拼，
 * 这样「表单里填的东西是否合法」与「服务端存下来的东西是否合法」用的是同一套判断，
 * 非法草稿返回 null（面板据此禁用「添加」按钮）。
 */
export function draftToRule(draft: RuleDraft): ColorRule | null {
  const [rule] = normalizeRules([{
    id: PREVIEW_RULE_ID,
    enabled: true,
    field: draft.field,
    op: draft.op,
    key: draft.field === 'property' ? draft.key : undefined,
    value: draft.value,
    color: draft.color
  }])
  return rule ?? null
}
