// 验收脚本的共享配置：目标地址 / 登录凭据 / 浏览器与 puppeteer-core 位置。
//
// 凭据**不入库**：读取顺序为
//   1. 进程环境变量（CI / 临时覆盖用）
//   2. 仓库根目录的 .env.acceptance（已被 .gitignore 的 `.env.*` 规则覆盖）
// 两者都缺失时，脚本会在用到凭据处给出明确指引后退出。
// 模板见同目录 .env.acceptance.example。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** 仓库根目录（scripts/acceptance 的上两级）。截图输出等路径都以此为基准。 */
export const PROJECT_ROOT = resolve(here, '../..')

// 解析 .env.acceptance（KEY=VALUE，# 开头为注释）；已存在的进程环境变量优先
const dotenv = {}
try {
  for (const line of readFileSync(resolve(PROJECT_ROOT, '.env.acceptance'), 'utf-8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) dotenv[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {
  /* 文件不存在 → 只用进程环境变量 */
}

const cfg = (name, fallback) => process.env[name] ?? dotenv[name] ?? fallback

/** 被测应用的基地址（默认本地 3100，与生产验证脚本口径一致） */
export const BASE = cfg('GARDEN_BASE', 'http://localhost:3100')

/** 初始管理员（root）的访问密钥。绝不硬编码进仓库 —— 这是真实凭据。 */
export const ROOT_KEY = cfg('GARDEN_ROOT_KEY', '')

/** Chrome 可执行文件路径；非默认安装位置时必须显式提供 */
export const CHROME = cfg('GARDEN_CHROME', 'C:/Program Files/Google/Chrome/Application/chrome.exe')

const PUPPETEER_CORE_DIR = cfg('PUPPETEER_CORE_DIR', '')

/** 加载 puppeteer-core：优先项目内依赖，其次 PUPPETEER_CORE_DIR 指定目录 */
export async function loadPuppeteer() {
  const candidates = [PROJECT_ROOT, PUPPETEER_CORE_DIR].filter(Boolean)
  for (const dir of candidates) {
    try {
      const req = createRequire(resolve(dir, 'noop.js'))
      return (await import(pathToFileURL(req.resolve('puppeteer-core')).href)).default
    } catch {
      /* 换下一个候选目录 */
    }
  }
  throw new Error(
    '找不到 puppeteer-core。请在项目内安装（pnpm add -D puppeteer-core），'
    + '或在 .env.acceptance / 环境变量中设置 PUPPETEER_CORE_DIR 指向含 puppeteer-core 的目录。\n'
    + `已尝试：${candidates.join(' , ')}`
  )
}
