import { createError, defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { saveLlmSettings } from '../../../utils/settings'

/**
 * PUT /api/admin/settings/llm
 * 保存 AI 增强配置（仅初始管理员 / 普通管理员）。保存后立即生效，**无需重启**。
 *
 * body: { enabled?: boolean, baseUrl?: string, model?: string, apiKey?: string, clearKey?: boolean }
 *   · apiKey 留空 = 沿用已存的那把（不会把密钥洗掉）
 *   · clearKey: true = 明确清除已存密钥
 *
 * 密钥在 server/utils/settings.ts 里加密后才落库，响应只回脱敏视图。
 */
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const body = (await readBody<Record<string, unknown>>(event)) || {}
  try {
    const llm = await saveLlmSettings({
      enabled: body.enabled,
      baseUrl: body.baseUrl,
      model: body.model,
      apiKey: body.apiKey,
      clearKey: body.clearKey
    })
    // 只记「谁改了开关/地址/模型」与「是否换了密钥」，**不记密钥本身**
    console.log(`[garden] settings: AI 增强配置已更新 by=${actor.label || actor.id} enabled=${llm.enabled} model=${llm.model || '-'} key=${llm.hasKey ? 'set' : 'none'}`)
    return { ok: true, llm }
  } catch (e) {
    throw createError({ statusCode: 400, message: e instanceof Error ? e.message : '保存失败' })
  }
})
