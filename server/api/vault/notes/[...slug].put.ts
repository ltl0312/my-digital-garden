import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import { resolveVaultPath, stripNul } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { invalidateGardenCache } from '../../../utils/cache'
import { prisma } from '../../../utils/db'
import { processMarkdownFile } from '../../../utils/markdown'

/**
 * gray-matter 的引擎探测带模块级缓存：进程内第一次遇到坏 frontmatter 会抛异常，
 * 之后**同一个进程再遇到坏头部就静默返回 `{}`**（实测第二次起 `matter(bad)` 不再抛）。
 * 于是「坏头部不许落盘」的守卫会随服务运行时间推移而失效——第一份坏载荷 400、
 * 第二份起 200 并覆盖掉磁盘上的正文。这里改用 js-yaml 直接解析头块，每次都是
 * 全新解析，不依赖任何模块级缓存。
 */
type YamlLike = { load?: (input: string) => unknown; safeLoad?: (input: string) => unknown }
let yamlLib: YamlLike | false | null = null
async function loadYaml(): Promise<YamlLike | false> {
  if (yamlLib !== null) return yamlLib
  try {
    const mod = (await import('js-yaml')) as unknown as { default?: YamlLike } & YamlLike
    yamlLib = (mod.default ?? mod) as YamlLike
  } catch {
    yamlLib = false
    console.warn('[garden] vault: 未能加载 js-yaml，frontmatter 预校验退回 gray-matter（其引擎缓存在同进程内只抛一次，守卫可能失效）')
  }
  return yamlLib
}

/**
 * 文件版本号 = `${十进制毫秒 mtimeMs}:${sha256(文件全文).slice(0,16)}`
 *
 * 单调性来自 mtime，内容敏感来自 hash：单看 mtime 会被「同一毫秒内两次写」
 * 骗过（Windows 时间戳粒度即 1ms），单看 hash 则无法区分「内容相同但确实
 * 被别的编辑器重写过」。两者拼起来才是前端 baseVersion 契约的那串值。
 *
 * mtimeMs 取整：`fs.stat` 返回浮点毫秒（Linux 下带小数），不取整会让
 * 同一份文件在两次 stat 之间出现 `1763...1234.567` / `1763...1234` 两种拼法，
 * 前端回传的值就永远比不等。
 */
function fileVersion(mtimeMs: number, raw: string): string {
  return `${Math.round(mtimeMs)}:${createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16)}`
}

/**
 * 正文覆盖写回：`PUT /api/vault/notes/<slug>`
 *
 * body: { content: string; baseVersion?: string }
 *   - baseVersion 省缺 = 旧行为（无条件覆盖），向后兼容；
 *   - baseVersion 存在 = 乐观锁：与磁盘当前版本不等即 409，**绝不写盘**。
 *
 * 判定顺序固定为「文件不存在 → frontmatter 坏 → 版本冲突」：
 * 前两条判定的是「这次能不能安全写」，冲突判定的是「该不该写」，
 * 顺序反了会把「文件已被删除」报成冲突，前端就分不清该重建还是该合并。
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parts = event.context.params?.slug
  const slug = Array.isArray(parts) ? parts.join('/') : parts
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Invalid Slug', data: { code: 'INVALID_SLUG' } })
  }

  const body = await readBody<{ content?: string; baseVersion?: string }>(event)
  const content = body?.content
  if (typeof content !== 'string') {
    throw createError({ statusCode: 400, message: 'content required', data: { code: 'CONTENT_REQUIRED' } })
  }

  // baseVersion 只接受字符串或省缺：传了别的类型说明调用方拼错了版本串，
  // 静默当「没传」会退化成无条件覆盖，把别处刚写的内容吞掉 —— 必须明确拒绝。
  const baseVersionRaw = body?.baseVersion
  if (baseVersionRaw !== undefined && typeof baseVersionRaw !== 'string') {
    throw createError({ statusCode: 400, message: 'baseVersion 必须是字符串', data: { code: 'INVALID_BASE_VERSION' } })
  }
  const baseVersion = typeof baseVersionRaw === 'string' && baseVersionRaw.trim() ? baseVersionRaw.trim() : undefined

  let full: string
  try {
    full = resolveVaultPath(slug + '.md')
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path', data: { code: 'INVALID_PATH' } })
  }

  // ① 文件不存在 → 404（旧实现把读不到当空文件 → 用空 frontmatter 写回，
  //    等于「对着一篇已删除的笔记静默重建」，且会丢掉所有元数据）
  const existing = await fs.readFile(full, 'utf-8').catch(() => null)
  if (existing === null) {
    throw createError({ statusCode: 404, message: '笔记不存在', data: { code: 'NOTE_NOT_FOUND' } })
  }
  const stat = await fs.stat(full)

  // ② frontmatter 解析失败 → 400，口径与 PATCH 完全一致。
  //    旧实现吞掉异常后以 `frontmatter = {}` 继续写回，结果是「正文保存成功、
  //    文件头整块消失」（tags/maturity/created 全丢），用户看到的是元数据凭空蒸发。
  let frontmatter: Record<string, unknown>
  try {
    frontmatter = (matter(existing).data || {}) as Record<string, unknown>
  } catch {
    throw createError({
      statusCode: 400,
      message: 'frontmatter 解析失败，请先修复文件头部格式',
      data: { code: 'FRONTMATTER_INVALID' }
    })
  }

  // ②b 正文自带 frontmatter 时也要先验：坏掉的头部一旦落盘，watcher / 详情页 /
  //      搜索会在下一次解析时统一炸开（本地实测落 500 且文件已被写坏）。
  //      这里只做「能不能解析」的探测，真正的头部仍以磁盘现值为准（见 ③ 之后）。
  if (/^---\r?\n/.test(content)) {
    const fence = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(content)
    const yaml = await loadYaml()
    let headOk = false
    if (!fence) {
      // 只有开头的 `---` 没有收尾的 `---`：按普通正文对待（正文里以分隔线开头很常见），
      // 真正的头部仍以磁盘现值为准，写回时会补在前面，不会写出半截 YAML
      headOk = true
    } else if (yaml) {
      const parse = yaml.load ?? yaml.safeLoad
      if (parse) {
        try {
          parse(fence[1])
          headOk = true
        } catch {
          headOk = false
        }
      }
    }
    if (!headOk && yaml === false) {
      // 极端兜底：js-yaml 解析不到时退回 gray-matter（只关心「第一次」是否抛）
      try {
        matter(content)
        headOk = true
      } catch {
        headOk = false
      }
    }
    if (!headOk) {
      throw createError({
        statusCode: 400,
        message: '正文头部 frontmatter 格式有误，未写入',
        data: { code: 'FRONTMATTER_INVALID' }
      })
    }
  }

  // ③ 乐观锁：磁盘版本与前端手上的 baseVersion 不等 → 409，不写盘
  const currentVersion = fileVersion(stat.mtimeMs, existing)
  if (baseVersion && baseVersion !== currentVersion) {
    throw createError({
      statusCode: 409,
      message: '笔记已被其他位置修改',
      data: {
        code: 'NOTE_CONFLICT',
        currentVersion,
        /** 磁盘文件的最后修改时间（ISO 8601），供前端提示「别的窗口/编辑器何时改的」 */
        currentUpdatedAt: stat.mtime.toISOString()
      }
    })
  }

  // 保留原 frontmatter：正文来自数据库（gray-matter 已剥离 YAML），直接覆盖写文件会丢失头部
  const cleanContent = stripNul(content)
  let finalContent: string
  try {
    finalContent = Object.keys(frontmatter).length
      ? matter.stringify(cleanContent, frontmatter)
      : cleanContent
  } catch (e) {
    // 正文以 `---` 开头但破得连 gray-matter 的引擎探测都过不去（本地实测会抛
    // `gray-matter engine "…" is not registered`）—— 这属于调用方内容非法，
    // 不是服务器故障，必须 400；否则一个坏载荷就能把保存接口打成 500。
    console.warn('[garden] vault: 正文无法序列化，拒绝写入', slug, e)
    throw createError({
      statusCode: 400,
      message: '正文头部 frontmatter 格式有误，未写入',
      data: { code: 'FRONTMATTER_INVALID' }
    })
  }

  // ③b 内容与磁盘完全一致 → 不写盘、不推进 mtime、不失效缓存：
  //      空保存（点保存但没改字）本来就没有可写的东西，重写一次只会让同一毫秒
  //      的 mtime 推进、把别处打开的编辑器手上的 baseVersion 无故作废。
  if (finalContent === existing) {
    const parsedExisting = matter(existing)
    const dbNote = await prisma.note.findUnique({ where: { slug }, select: { content: true } })
    return {
      ok: true,
      slug,
      updatedAt: stat.mtime.toISOString(),
      indexed: !!dbNote && dbNote.content.trimEnd() === parsedExisting.content.trimEnd(),
      version: currentVersion,
      processed: false,
      unchanged: true
    }
  }

  // 原子写入：先写同目录临时文件再 rename，避免 watcher 读到写入一半的内容
  const tmp = full + '.tmp'
  await fs.writeFile(tmp, finalContent, 'utf-8')
  await fs.rename(tmp, full)
  // 保存正文后立即失效 tree/overview 缓存（树的成熟度点、首页统计、列表都来自缓存数据）
  invalidateGardenCache()

  // 同步入库（不是「先返回、等 watcher」）：前端拿到 200 后立刻重读详情页，
  // 若这里只失效缓存不入库，返回的仍是旧正文 —— 表现为「保存成功但页面没变」。
  // 入库失败不能变成 500：文件已落盘，此时报错只会让前端以为「保存失败」而重试，
  // 重试必然撞 409（磁盘版本已推进）。入库交给 watcher 兜底，响应里 indexed=false。
  let processed = false
  try {
    processed = await processMarkdownFile(full)
  } catch (e) {
    console.warn('[garden] vault: 保存后同步入库失败，交由 watcher 兜底', full, e)
  }

  // 回读 + 版本：版本必须基于**新写入后**的文件算（mtime 已推进），
  // 前端把它作为下一次保存的 baseVersion 回传。
  const writtenRaw = await fs.readFile(full, 'utf-8')
  const writtenStat = await fs.stat(full)
  const version = fileVersion(writtenStat.mtimeMs, writtenRaw)

  const note = await prisma.note.findUnique({
    where: { slug },
    select: { content: true, updatedAt: true }
  })

  // indexed 不用 processMarkdownFile 的返回值直接当结论：它返回 false 既可能是
  // 「内容未变、本来就已入库」（正常的幂等跳过），也可能是「处理失败」。
  // 这里按「DB 正文 == 新文件正文」判定，两种 false 才分得开。
  let indexed = false
  try {
    const parsedWritten = matter(writtenRaw)
    indexed = !!note && note.content.trimEnd() === parsedWritten.content.trimEnd()
  } catch {
    indexed = false
  }

  // ok:true 只代表「文件已落盘」；indexed:false 时前端应提示「已保存但索引未更新」，
  // 而不是重试写入（重试只会撞 409，因为磁盘版本已经推进）。
  return {
    ok: true,
    slug,
    updatedAt: note?.updatedAt.toISOString() ?? writtenStat.mtime.toISOString(),
    indexed,
    version,
    /** 仅用于排查：processMarkdownFile 是否真的走了完整入库流程 */
    processed
  }
})
