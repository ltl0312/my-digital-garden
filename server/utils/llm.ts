/**
 * LLM 增强判定（**默认关闭**；配置来自「管理后台 → AI 增强设置」，环境变量为回退）
 *
 * 立场：
 *   · 未配置密钥时本模块完全短路，一个请求都不发。自动化能力因此**不依赖**任何外部服务
 *     —— 规则引擎（server/utils/tag-suggest.ts）单独可用。
 *   · 配置的读取与「密钥加密落库」在 server/utils/settings.ts（DB 优先、env 回退）。
 *     本模块只负责调用；密钥不进日志、不进响应、不进 rationale。
 *   · 失败一律降级为 null，由调用方回退到规则结果。**绝不因为模型抽风而让审核清单变空**。
 *
 * 与规则引擎的契约：LLM 只能在给定的候选标签/领域里**选**，不能造新词
 * （返回值逐个过白名单校验，越界的直接丢弃并在 rationale 里说明被丢弃了几个）。
 * 这样即使模型幻觉，也污染不了标签体系。
 */
import { isKnownDomain } from '#shared/graph-domain'
import { getLlmSettings } from './settings'

export interface LlmConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

/**
 * 读取生效配置。超时时间仍只认环境变量（运维调参项，不值得进界面）。
 * `enabled` 已把「配齐了才可能生效」算进去：开了开关但缺密钥/模型时视为未启用。
 */
export async function llmConfig(): Promise<LlmConfig> {
  const s = await getLlmSettings()
  return {
    enabled: s.enabled && !!s.apiKey && !!s.model,
    baseUrl: s.baseUrl,
    apiKey: s.apiKey,
    model: s.model,
    timeoutMs: Math.max(1000, Number(process.env.TAG_LLM_TIMEOUT_MS) || 20_000)
  }
}

export interface LlmSuggestRequest {
  title: string
  /** 正文（调用方已截断，避免超长 prompt） */
  content: string
  currentTags: string[]
  currentDomain: string
  /** 候选标签白名单（vault 既有标签） */
  candidateTags: string[]
  /** 候选领域白名单（已知领域目录名） */
  candidateDomains: string[]
}

export interface LlmSuggestResult {
  tags: string[]
  /** null = 不建议换领域 */
  domain: string | null
  confidence: number
  rationale: string[]
  /** 被白名单丢弃的越界项数量（用于向审核者如实报告模型跑偏程度） */
  dropped: number
}

const SYSTEM_PROMPT = [
  '你是个人知识库的笔记分类助手。你的唯一任务：从给定的候选标签与候选领域里，选出最贴合这篇笔记的若干项。',
  '硬约束（违反即视为失败）：',
  '1. 标签必须**逐字**取自候选标签列表，禁止创造新标签、禁止改写、禁止翻译。',
  '2. 领域必须逐字取自候选领域列表；若不合适就不要给领域建议。',
  '3. 已被笔记当前标签覆盖的内容不要再推荐。',
  '只输出 JSON，不要输出任何解释性文字或 markdown 代码块。',
  'JSON 结构：{"tags": string[], "domain": string|null, "confidence": 0-100 的整数, "reasons": string[]}',
  'reasons 用中文短句，说明每个选择的依据（如「标题直接讲 Vue3 组合式 API」）。'
].join('\n')

/** 从模型回复里稳健地抠出 JSON（容忍 ```json 包裹与前后废话） */
export function extractJson(text: string): unknown {
  const t = String(text || '').trim()
  if (!t) return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  const body = fenced?.[1]?.trim() || t
  try {
    return JSON.parse(body)
  } catch {
    // 退一步：取第一个 { 到最后一个 } 的区间
    const a = body.indexOf('{')
    const b = body.lastIndexOf('}')
    if (a < 0 || b <= a) return null
    try {
      return JSON.parse(body.slice(a, b + 1))
    } catch {
      return null
    }
  }
}

/**
 * 调一次 LLM 判定。未配置 / 超时 / 网络错误 / 返回不可解析 / 全被白名单丢弃 → 返回 null。
 * 调用方必须能接受 null 并回退到规则结果。
 */
export async function llmSuggest(req: LlmSuggestRequest): Promise<LlmSuggestResult | null> {
  const cfg = await llmConfig()
  if (!cfg.enabled) return null
  if (!req.candidateTags.length && !req.candidateDomains.length) return null

  const user = [
    `标题：${req.title}`,
    `当前标签：${req.currentTags.length ? req.currentTags.join('、') : '（无）'}`,
    `当前领域：${req.currentDomain || '（未知）'}`,
    '',
    `候选标签（只能从中选）：${req.candidateTags.join('、')}`,
    `候选领域（只能从中选，可不选）：${req.candidateDomains.join('、')}`,
    '',
    '正文（可能被截断）：',
    req.content
  ].join('\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user }
        ]
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      // 不回显 body（可能含请求回显），只记状态码与模型名
      console.warn(`[garden] tag-llm: 判定失败 HTTP ${res.status}（model=${cfg.model}），回退规则引擎`)
      return null
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const text = data?.choices?.[0]?.message?.content || ''
    const parsed = extractJson(text) as
      | { tags?: unknown; domain?: unknown; confidence?: unknown; reasons?: unknown }
      | null
    if (!parsed) {
      console.warn('[garden] tag-llm: 返回内容无法解析为 JSON，回退规则引擎')
      return null
    }

    // ── 白名单收敛：模型只能在候选里选，越界丢弃 ──────────────────────────
    const allowedTags = new Set(req.candidateTags)
    const rawTags = Array.isArray(parsed.tags) ? parsed.tags : []
    let dropped = 0
    const tags: string[] = []
    for (const t of rawTags) {
      if (typeof t !== 'string') { dropped++; continue }
      const name = t.trim()
      if (!name) continue
      if (!allowedTags.has(name)) { dropped++; continue }
      if (req.currentTags.some(c => c.trim().toLowerCase() === name.toLowerCase())) continue
      if (!tags.includes(name)) tags.push(name)
    }

    const allowedDomains = new Set(req.candidateDomains)
    const rawDomain = typeof parsed.domain === 'string' ? parsed.domain.trim() : ''
    let domain: string | null = null
    if (rawDomain) {
      if (allowedDomains.has(rawDomain) && isKnownDomain(rawDomain, req.candidateDomains)) domain = rawDomain
      else { dropped++; }
    }

    const rawConf = Number(parsed.confidence)
    const confidence = Number.isFinite(rawConf) ? Math.max(0, Math.min(100, Math.round(rawConf))) : 50
    const rationale = (Array.isArray(parsed.reasons) ? parsed.reasons : [])
      .filter((r): r is string => typeof r === 'string' && !!r.trim())
      .slice(0, 5)
      .map(r => r.trim())

    if (!tags.length && !domain) {
      // 全被丢弃 / 什么都没给 —— 视作无效，回退规则结果
      console.warn(`[garden] tag-llm: 无有效判定（丢弃 ${dropped} 项），回退规则引擎`)
      return null
    }
    return { tags, domain, confidence, rationale, dropped }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[garden] tag-llm: 调用异常（${msg}），回退规则引擎`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 给审核界面/设置界面用的状态描述（**不含任何密钥信息**，只回模型名与地址） */
export async function llmStatus(): Promise<{ enabled: boolean; model: string; baseUrl: string }> {
  const cfg = await llmConfig()
  return { enabled: cfg.enabled, model: cfg.enabled ? cfg.model : '', baseUrl: cfg.enabled ? cfg.baseUrl : '' }
}

/** 出错信息里若回显了密钥，一律打码后再外传（上游有时会把 Authorization 回显进 body） */
function redact(text: string, apiKey: string): string {
  let out = text
  if (apiKey) out = out.split(apiKey).join('***')
  return out.replace(/\s+/g, ' ').slice(0, 200)
}

export interface TestResult {
  ok: boolean
  /** HTTP 状态码（网络层失败为 0） */
  status: number
  /** 人话结论 */
  message: string
  /** 上游返回片段（已打码、已截断） */
  detail: string
}

/**
 * 测试连接（设置界面的「测试连接」按钮）。
 *
 * 先试 `GET /models`（OpenAI 兼容、**不消耗 token**）；有些网关不实现该端点（404/405），
 * 再退回一次极小的 chat 请求（max_tokens=1）来真正验证「地址 + 密钥 + 模型名」可用。
 * 允许用表单里**尚未保存**的值测试（override），这样用户可以先验证再点保存。
 */
export async function testLlmConnection(override: {
  baseUrl?: string
  model?: string
  apiKey?: string
} = {}): Promise<TestResult> {
  const stored = await llmConfig()
  const baseUrl = (override.baseUrl || stored.baseUrl || '').trim().replace(/\/+$/, '')
  const model = (override.model || stored.model || '').trim()
  const apiKey = (override.apiKey || '').trim() || stored.apiKey

  if (!baseUrl) return { ok: false, status: 0, message: '请先填写 API 地址', detail: '' }
  if (!apiKey) return { ok: false, status: 0, message: '请先填写 API 密钥', detail: '' }

  const timeoutMs = Math.max(3000, Math.min(60_000, stored.timeoutMs))
  const call = async (path: string, init: RequestInit): Promise<{ status: number; text: string; contentType: string }> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${apiKey}`, ...(init.headers || {}) },
        signal: ctrl.signal
      })
      return {
        status: res.status,
        text: await res.text().catch(() => ''),
        contentType: res.headers.get('content-type') || ''
      }
    } finally {
      clearTimeout(timer)
    }
  }
  const parseJson = (text: string): any => {
    try { return JSON.parse(text) } catch { return null }
  }

  try {
    const models = await call('/models', { method: 'GET' })
    if (models.status >= 200 && models.status < 300) {
      // ⚠️ **只看状态码会把「地址指错」误判成成功**。
      // 实测：用户把 baseUrl 填成 `http://localhost:3000/v1`（在服务器上那就是本应用自身），
      // `/v1/models` 被应用以 200 + HTML 返回，界面于是显示「连接成功（地址与密钥可用）」，
      // 而实际上一次都调不通 —— 用户因此完全不知道该改哪里。
      // 所以必须校验响应体是 **OpenAI 兼容形状**（`{ data: [...] }`），不能只判 2xx。
      const body = parseJson(models.text)
      if (!body || !Array.isArray(body.data)) {
        return {
          ok: false,
          status: models.status,
          message: models.contentType.includes('json')
            ? '地址可达，但返回的不是 OpenAI 兼容的模型列表（缺少 data 数组）—— 请确认地址指向的是模型网关而不是别的服务'
            : '地址可达，但返回的不是 JSON（很可能指向了一个普通网页或本应用自身）—— 请检查 API 地址',
          detail: redact(models.text, apiKey)
        }
      }
      return {
        ok: true,
        status: models.status,
        message: model ? `连接成功（地址与密钥可用；保存后将使用模型 ${model}）` : '连接成功（地址与密钥可用）',
        detail: ''
      }
    }
    if (models.status !== 404 && models.status !== 405) {
      return {
        ok: false,
        status: models.status,
        message: models.status === 401 || models.status === 403
          ? '密钥被拒绝（401/403）：请检查 API 密钥是否正确、是否有该网关的权限'
          : `连接失败（HTTP ${models.status}）`,
        detail: redact(models.text, apiKey)
      }
    }

    // 该网关不提供 /models → 用一次极小 chat 请求验证
    if (!model) {
      return { ok: false, status: models.status, message: '该网关不提供 /models 端点，请先填写模型名再测试', detail: '' }
    }
    const chat = await call('/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
    })
    if (chat.status >= 200 && chat.status < 300) {
      // 同样校验形状：200 也可能是「指到了别的服务」返回的 HTML 页面
      const cb = parseJson(chat.text)
      if (!cb || !Array.isArray(cb.choices)) {
        return {
          ok: false,
          status: chat.status,
          message: '调用返回 200，但不是 OpenAI 兼容的 chat 响应（缺少 choices）—— 请检查地址是否指向真正的模型网关',
          detail: redact(chat.text, apiKey)
        }
      }
      return { ok: true, status: chat.status, message: `连接成功，模型 ${model} 可用`, detail: '' }
    }
    return {
      ok: false,
      status: chat.status,
      message: chat.status === 404
        ? `模型「${model}」或 /chat/completions 不存在（HTTP 404）`
        : chat.status === 401 || chat.status === 403
          ? '密钥被拒绝（401/403）'
          : `调用失败（HTTP ${chat.status}）`,
      detail: redact(chat.text, apiKey)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const aborted = /abort/i.test(msg)
    return {
      ok: false,
      status: 0,
      message: aborted ? `连接超时（${timeoutMs}ms）` : '无法连接到该地址（DNS/网络/TLS 失败）',
      detail: redact(msg, apiKey)
    }
  }
}
