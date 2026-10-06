import { defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { testLlmConnection } from '../../../utils/llm'

/**
 * POST /api/admin/settings/llm-test
 * 测试 AI 增强的连接（仅初始管理员 / 普通管理员）。
 *
 * body: { baseUrl?, model?, apiKey? }  —— 允许用**表单里尚未保存的值**测试，便于「先验证再保存」；
 * 字段缺省时回退到已保存的配置。
 *
 * 返回 { ok, status, message, detail }，其中 detail 已由 server/utils/llm.ts 打码与截断，
 * **不会回显密钥**。测试不写库、不改任何设置。
 *
 * 路由名刻意用 `llm-test` 而不是 `llm/test`：避免与同目录的 `llm.get.ts` / `llm.put.ts`
 * 形成「同名文件 + 同名目录」的歧义布局。
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{ baseUrl?: unknown; model?: unknown; apiKey?: unknown }>(event)) || {}
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return testLlmConnection({
    baseUrl: str(body.baseUrl),
    model: str(body.model),
    apiKey: str(body.apiKey)
  })
})
