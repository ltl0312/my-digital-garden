import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { getLlmPublic } from '../../../utils/settings'

/**
 * GET /api/admin/settings/llm
 * 读取 AI 增强配置（仅初始管理员 / 普通管理员）。
 *
 * **绝不回传密钥明文**：只给 `hasKey` 与 `keyTail`（末 4 位），用于让管理员确认存的是哪一把。
 * 这是刻意的：一旦密钥能被 GET 出来，它就会出现在浏览器历史、devtools、日志与截图里。
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { llm: await getLlmPublic() }
})
