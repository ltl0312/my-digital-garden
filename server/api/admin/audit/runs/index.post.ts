import { createError, defineEventHandler, readBody } from 'h3'
import { requireBuiltinAdmin } from '../../../../utils/auth'
import { markAuditFailed, newAuditId, previewScope, runAudit, type AuditScope } from '../../../../utils/audit'
import { llmStatus } from '../../../../utils/llm'

/**
 * POST /api/admin/audit/runs
 * 发起一次审计。仅初始管理员。
 *
 * body: { folders?: string[], tags?: string[], domains?: string[], keyword?: string, limit?: number }
 *
 * **后台执行**：一次审计要对每篇笔记调一次模型，20 篇约 20–40 秒，
 * 60 篇可能过分钟。同步返回会让浏览器/反代超时，还会让用户以为「点了没反应」。
 * 所以这里立刻回执 id，前端轮询 GET /runs/:id 看进度（报告里 complete=false 即进行中）。
 */
export default defineEventHandler(async (event) => {
  const key = await requireBuiltinAdmin(event)
  const body = (await readBody<Partial<AuditScope>>(event)) || {}

  const scope: AuditScope = {
    folders: Array.isArray(body.folders) ? body.folders.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [],
    tags: Array.isArray(body.tags) ? body.tags.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [],
    domains: Array.isArray(body.domains) ? body.domains.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [],
    keyword: typeof body.keyword === 'string' ? body.keyword.trim() : '',
    limit: Number(body.limit) || undefined
  }

  const llm = await llmStatus()
  if (!llm.enabled) {
    // 没有模型就无从审计 —— 明确告诉用户去哪配，而不是跑出一个空报告
    throw createError({ statusCode: 400, message: 'AI 增强未启用：请先在「管理后台 → AI 增强设置」里配置可用的模型与密钥' })
  }

  const preview = await previewScope(scope)
  if (!preview.matched) throw createError({ statusCode: 400, message: '当前筛选条件下没有匹配的笔记' })

  const id = newAuditId()
  // 不 await：立刻回执 id。异常写进报告，避免前端永远转圈。
  void runAudit({ id, scope, actor: key.label || '初始管理员', model: llm.model })
    .catch(async (e: unknown) => {
      await markAuditFailed(id, (e as Error)?.message || '未知错误')
    })

  return { ok: true, id, preview, model: llm.model }
})
