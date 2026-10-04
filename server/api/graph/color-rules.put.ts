import { createError, defineEventHandler, readBody } from 'h3'
import { prisma } from '../../utils/db'
import { requireAuth } from '../../utils/auth'
import { MAX_COLOR_RULES, normalizeRules } from '#shared/graph-colors'
import type { Prisma } from '../../../prisma/generated/client'

/**
 * 覆盖写入当前用户的图谱颜色规则。
 *
 * body: `{ rules: ColorRule[] }` —— **数组顺序即优先级**（下标 0 最高），
 * 所以整体替换就行，不用算差集、也不用维护排序列。一行 jsonb 一次 upsert。
 *
 * 逐条过 normalizeRules 清洗：非法的整条丢弃（不 400，避免一条脏数据废掉整份规则），
 * 被丢掉的条数回在 `dropped` 里，前端能提示。
 */
export default defineEventHandler(async (event) => {
  const key = await requireAuth(event)
  const body = await readBody(event).catch(() => null)
  const raw = (body as { rules?: unknown } | null)?.rules

  if (!Array.isArray(raw)) {
    throw createError({ statusCode: 400, message: 'body.rules 必须是数组' })
  }
  if (raw.length > MAX_COLOR_RULES) {
    throw createError({ statusCode: 413, message: `颜色规则最多 ${MAX_COLOR_RULES} 条` })
  }

  const rules = normalizeRules(raw)
  const dropped = raw.length - rules.length
  const payload = rules as unknown as Prisma.InputJsonValue
  const now = new Date()

  await prisma.graphColorRules.upsert({
    where: { keyId: key.id },
    create: { keyId: key.id, rules: payload, updatedAt: now },
    update: { rules: payload, updatedAt: now }
  })

  return { ok: true, count: rules.length, dropped }
})
