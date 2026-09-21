// 生产启动包装器（Windows 兼容）
//
// 为什么要这层包装：
//   nitro 产物 `.output/server/chunks/_/nitro.mjs` 的首行是
//     globalThis._importMeta_ = globalThis._importMeta_ || { url: "file:///_entry.js", env: process.env }
//   而 ESM 的 import 是**提升执行**的 —— 这句话先于入口 `index.mjs` 里的
//     globalThis._importMeta_ = { url: import.meta.url, env: process.env }
//   执行，于是占位 url "file:///_entry.js" 会赢得赋值，并被内联的 Prisma 客户端用于
//     path.dirname(fileURLToPath(globalThis._importMeta_.url))
//   - Linux：fileURLToPath("file:///_entry.js") → "/_entry.js"，合法，因此 Docker 部署不受影响
//   - Windows：getPathFromURLWin32 要求带盘符的绝对路径 → 抛 ERR_INVALID_FILE_URL_PATH 直接崩
// 本包装器在加载入口之前，把 url 设成入口文件真实的绝对 file URL，两端行为一致。
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const entry = resolve(here, '..', '.output', 'server', 'index.mjs')

if (!existsSync(entry)) {
  console.error('[garden] 未找到构建产物 .output/server/index.mjs —— 请先执行 pnpm build')
  process.exit(1)
}

const entryUrl = pathToFileURL(entry).href
globalThis._importMeta_ = { url: entryUrl, env: process.env }

await import(entryUrl)
