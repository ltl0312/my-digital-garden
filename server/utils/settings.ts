/**
 * 应用级设置（AppSetting 单例键值表）的读写层 —— 目前承载「AI 增强」配置。
 *
 * 三条设计约束（改这个文件前先读）：
 *
 * ① **敏感值加密落库**。AI 增强用的是第三方 API 密钥（有真实计费），而本项目的数据库
 *    会被完整备份/导出。因此密钥以 AES-256-GCM 加密后写入 jsonb，加密密钥由 AUTH_SECRET
 *    派生 —— AUTH_SECRET 只在 .env / 容器环境里，**不在数据库里**，所以库被拖走也拿不到明文。
 *    代价：AUTH_SECRET 变更后旧密文解不开，此时**如实报错并让人重新填写**，不静默降级
 *    （静默降级会让人以为「密钥还在，只是不生效」，比报错更难排查）。
 *
 * ② **密钥永不回传前端**。对外的视图只给 `hasKey` 与末 4 位（`keyTail`），
 *    用于让管理员确认「存的是哪一把」，而不构成可用的凭据。
 *
 * ③ **DB 优先、env 回退**。设置界面是面向用户的控制面，所以只要库里有一行就以它为准
 *    （包括「关掉增强」这个决定 —— 即使环境变量里还留着密钥，也必须能被界面关掉）。
 *    库里的行**没有密钥**时才回退用环境变量的密钥：否则「先在 .env 配了密钥、后来在界面
 *    保存过一次表单（没填密钥）」会把本来能用的增强悄悄弄坏。
 *
 * 读取带 10s 进程内缓存：批量判定（一次几十篇）会对每篇问一次配置，不能每次都打库。
 * 写入后立即失效缓存，所以界面保存后马上生效，无需重启。
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { prisma } from './db'
import { AUTH_SECRET } from './auth'

/** AppSetting 的业务键：AI 增强（标签/领域判定） */
export const SETTING_KEY_TAG_LLM = 'tag-llm'

// ── 敏感值加解密 ────────────────────────────────────────────────────────────

/** 由 AUTH_SECRET 派生 32 字节密钥（sha256 足够：AUTH_SECRET 本身是高熵随机串） */
function encKey(): Buffer {
  return createHash('sha256').update(`garden:appsetting:v1:${AUTH_SECRET}`).digest()
}

/** 加密为 `v1:<iv>:<authTag>:<ciphertext>`（带版本前缀，便于以后换算法） */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`
}

/** 解密失败（换过 AUTH_SECRET / 数据损坏）返回 null —— 由调用方决定怎么提示 */
export function decryptSecret(blob: unknown): string | null {
  if (typeof blob !== 'string') return null
  const parts = blob.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  try {
    const iv = Buffer.from(parts[1]!, 'base64')
    const tag = Buffer.from(parts[2]!, 'base64')
    const ct = Buffer.from(parts[3]!, 'base64')
    const d = createDecipheriv('aes-256-gcm', encKey(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ── LLM 配置 ────────────────────────────────────────────────────────────────

export interface LlmSettings {
  /** 是否启用 AI 增强 */
  enabled: boolean
  baseUrl: string
  model: string
  /** 明文密钥（仅服务端内部使用，**绝不进 API 响应**） */
  apiKey: string
  /** 配置来源：db = 界面里配的；env = 环境变量；none = 都没配 */
  source: 'db' | 'env' | 'none'
  /** 密钥无法解密（换过 AUTH_SECRET）——界面需要如实提示重新填写 */
  keyBroken: boolean
}

export interface LlmSettingsPublic {
  enabled: boolean
  baseUrl: string
  model: string
  hasKey: boolean
  /** 已存密钥的末 4 位（未配置为空串） */
  keyTail: string
  source: 'db' | 'env' | 'none'
  keyBroken: boolean
  /** 配置齐全且已启用 —— 界面据此显示「生效中 / 未生效」 */
  usable: boolean
  /** 环境变量里是否也有一份配置（提示优先级用） */
  envFallback: boolean
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

/** env 回退（沿用改造前的变量名，便于无界面/CI 场景） */
function fromEnv(): { enabled: boolean; baseUrl: string; model: string; apiKey: string } {
  const apiKey = (process.env.TAG_LLM_API_KEY || '').trim()
  const model = (process.env.TAG_LLM_MODEL || '').trim()
  const explicit = (process.env.TAG_LLM_ENABLED || '').trim().toLowerCase()
  const enabled = explicit === '0' || explicit === 'false' ? false : !!apiKey && !!model
  return {
    enabled,
    baseUrl: (process.env.TAG_LLM_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
    model,
    apiKey
  }
}

let cache: { at: number; value: LlmSettings } | null = null
const CACHE_MS = 10_000

/** 失效缓存（保存设置后调用，使界面改动立即生效） */
export function invalidateSettingsCache() {
  cache = null
}

interface StoredLlm {
  enabled?: unknown
  baseUrl?: unknown
  model?: unknown
  apiKeyEnc?: unknown
}

/** 读取生效的 LLM 配置（含明文密钥，仅服务端使用） */
export async function getLlmSettings(): Promise<LlmSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value

  const env = fromEnv()
  let row: StoredLlm | null = null
  try {
    const r = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY_TAG_LLM } })
    if (r && r.value && typeof r.value === 'object') row = r.value as StoredLlm
  } catch (e) {
    // 表还没建（迁移未跑）时不能让整个判定挂掉：退回 env
    console.warn('[garden] settings: 读取 AppSetting 失败，本次退回环境变量配置', e instanceof Error ? e.message : e)
  }

  let keyBroken = false
  let dbKey = ''
  if (row && typeof row.apiKeyEnc === 'string' && row.apiKeyEnc) {
    const plain = decryptSecret(row.apiKeyEnc)
    if (plain === null) keyBroken = true
    else dbKey = plain
  }

  const dbBaseUrl = typeof row?.baseUrl === 'string' ? row.baseUrl.trim().replace(/\/+$/, '') : ''
  const dbModel = typeof row?.model === 'string' ? row.model.trim() : ''
  const dbEnabled = typeof row?.enabled === 'boolean' ? row.enabled : undefined

  const value: LlmSettings = {
    // 「关掉增强」是界面上的明确决定，必须压过环境变量
    enabled: dbEnabled !== undefined ? dbEnabled : env.enabled,
    baseUrl: dbBaseUrl || env.baseUrl || DEFAULT_BASE_URL,
    model: dbModel || env.model,
    // 库里没密钥时回退环境变量（见文件头 ③）
    apiKey: dbKey || env.apiKey,
    source: row ? 'db' : (env.apiKey || env.model ? 'env' : 'none'),
    keyBroken
  }
  cache = { at: Date.now(), value }
  return value
}

/** 对外视图：**不含密钥明文** */
export async function getLlmPublic(): Promise<LlmSettingsPublic> {
  const s = await getLlmSettings()
  const env = fromEnv()
  return {
    enabled: s.enabled,
    baseUrl: s.baseUrl,
    model: s.model,
    hasKey: !!s.apiKey,
    keyTail: s.apiKey ? s.apiKey.slice(-4) : '',
    source: s.source,
    keyBroken: s.keyBroken,
    usable: s.enabled && !!s.apiKey && !!s.model,
    envFallback: !!(env.apiKey || env.model)
  }
}

export interface SaveLlmInput {
  enabled?: unknown
  baseUrl?: unknown
  model?: unknown
  /** 新密钥；留空表示沿用已存的那把 */
  apiKey?: unknown
  /** 显式清除已存密钥 */
  clearKey?: unknown
}

const trimStr = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\r\n\t]/g, '').trim().slice(0, max) : ''

/**
 * 保存 LLM 配置。逐字段白名单校验（库里的值与前端来的值都不可信）。
 * 抛 Error 表示校验失败，由 API 层转成 400。
 */
export async function saveLlmSettings(input: SaveLlmInput): Promise<LlmSettingsPublic> {
  const existing = await getLlmSettings()

  const enabled = typeof input.enabled === 'boolean' ? input.enabled : existing.enabled
  const baseUrlRaw = trimStr(input.baseUrl, 300)
  const model = trimStr(input.model, 120)

  if (baseUrlRaw) {
    let u: URL
    try {
      u = new URL(baseUrlRaw)
    } catch {
      throw new Error('API 地址不是合法 URL（示例：https://api.deepseek.com/v1）')
    }
    // 只允许 http(s)：挡掉 file:// / ftp:// 之类的意外写法
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      throw new Error('API 地址必须以 http:// 或 https:// 开头')
    }
  }
  if (model && /[^\x20-\x7e\u4e00-\u9fff]/.test(model)) {
    throw new Error('模型名含非法字符')
  }

  const newKey = trimStr(input.apiKey, 200)
  const clearKey = input.clearKey === true

  // 组装待写入的密钥字段：
  //   · 填了新密钥 → 加密覆盖
  //   · clearKey    → 删除该字段
  //   · 都没给      → 保留原密文（不能把已有密钥洗掉）
  let apiKeyEnc: string | undefined
  if (clearKey) {
    apiKeyEnc = undefined
  } else if (newKey) {
    apiKeyEnc = encryptSecret(newKey)
  } else {
    const cur = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY_TAG_LLM } }).catch(() => null)
    const curEnc = (cur?.value as StoredLlm | null)?.apiKeyEnc
    apiKeyEnc = typeof curEnc === 'string' ? curEnc : undefined
  }

  // 用具体的 JSON 安全类型（不能声明成 Record<string, unknown>：Prisma 的 InputJsonValue
  // 不接受 unknown —— unknown 可能不是 JSON 值，编译器会拒绝）
  const value: { enabled: boolean; baseUrl: string; model: string; apiKeyEnc?: string } = {
    enabled,
    baseUrl: baseUrlRaw || existing.baseUrl || DEFAULT_BASE_URL,
    model
  }
  if (apiKeyEnc) value.apiKeyEnc = apiKeyEnc

  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY_TAG_LLM },
    update: { value },
    create: { key: SETTING_KEY_TAG_LLM, value }
  })
  invalidateSettingsCache()
  return getLlmPublic()
}
