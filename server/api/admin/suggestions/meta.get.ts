import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { pendingCount } from '../../../utils/suggest'
import { llmStatus } from '../../../utils/llm'

/**
 * GET /api/admin/suggestions/meta
 * 审核面板的轻量状态：待审数量 + AI 增强是否启用。
 * 单独成接口的原因：管理后台每次进入都要读这两个值，而 /api/admin/suggestions
 * 会顺带把整张待审表连笔记标签一起查出来 —— 只为显示一个数字不值得。
 *
 * 返回的 llm 对象**不含密钥**（server/utils/llm.ts 的 llmStatus 只回 enabled/model/baseUrl）。
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const [pending, llm] = await Promise.all([pendingCount(), llmStatus()])
  return { pending, llm }
})
