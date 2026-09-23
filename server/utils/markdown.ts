import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import rehypeShiki from '@shikijs/rehype'
import { prisma } from './db'
import { invalidateGardenCache } from './cache'
import { computeMaturityForNote } from './maturity-sync'

type MaturityValue = 'SEEDLING' | 'GROWING' | 'EVERGREEN'

// maturity 白名单：frontmatter 中出现非法值时告警并改走自动判定，避免整篇笔记解析失败
const MATURITY_VALUES: readonly MaturityValue[] = ['SEEDLING', 'GROWING', 'EVERGREEN']

// 摘要：正文前 120 字（折叠空白换行，便于列表展示）
const SUMMARY_LENGTH = 120

/**
 * 正则捕获组取值。本文件的模式里被取的组都是**必选组**，匹配成功即必然存在；
 * 但 noUncheckedIndexedAccess 会把 RegExpExecArray 的下标一律视为可能缺省。
 * 缺省时返回空串（与原语义下的 undefined 在后续 trim/split/replace 上的表现一致，
 * 且不会像原先那样抛 TypeError）。
 */
const cap = (m: RegExpMatchArray | RegExpExecArray | null | undefined, i: number): string =>
  m?.[i] ?? ''

/** 摘要清洗：把 Markdown / HTML 还原为适合列表展示的纯文本。
 *  此前 buildSummary 只做了空白折叠 + 截断，导致列表摘要直接显示原文标记 ——
 *  例如 `<h2>计算机牛马生存准则</h2>`、`# **主题**…`，看上去像「同一个标题出现了两次」。 */
export function cleanSummary(raw: string): string {
  let s = String(raw || '')
  s = s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') // frontmatter
  s = s.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ') // 围栏代码块
  s = s.replace(/`([^`]*)`/g, '$1') // 行内代码保留文字
  s = s.replace(/<[^>]+>/g, ' ') // HTML 标签（<h2> 等）
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片整体丢弃
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1') // wiki 链接
  s = s.replace(/^[ \t]{0,3}(#{1,6}|>|[-*+]|\d+[.)])[ \t]+/gm, '') // 行首标题/引用/列表标记
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2') // 粗体
  s = s.replace(/(\*|_)(.*?)\1/g, '$2') // 斜体
  s = s.replace(/~~(.*?)~~/g, '$1') // 删除线
  s = s.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, ' ') // 表格分隔行
  s = s.replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, ' ') // 水平线
  s = s.replace(/\|/g, ' ') // 表格竖线
  return s.replace(/\s+/g, ' ').trim()
}

export function buildSummary(markdown: string): string {
  return cleanSummary(markdown).slice(0, SUMMARY_LENGTH)
}

// 阅读时长估算：与前端 ArticleReader 展示逻辑对齐（字符数 / 400，最少 1 分钟）
export function estimateReadingTime(markdown: string): number {
  return Math.max(1, Math.round(markdown.length / 400))
}

// 将一批 WikiLink 目标解析为数据库真实 slug（三级匹配：精确 slug → basename → aliases）。
// 批量 IN 查询替代逐条串行查询（N+1），全量重同步时显著降低 DB 往返。
async function resolveTargetSlugs(targets: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const unique = [...new Set(targets)].map(t => t.trim()).filter(Boolean)
  if (!unique.length) return map

  // 第一级：精确 slug 匹配（批量）
  const exact = await prisma.note.findMany({
    where: { slug: { in: unique } },
    select: { slug: true }
  })
  const exactSet = new Set(exact.map(n => n.slug))
  const rest1 = unique.filter(t => !exactSet.has(t))
  for (const t of unique) map.set(t, exactSet.has(t) ? t : null)
  if (!rest1.length) return map

  // 第二级：basename 匹配（Obsidian 最短文件名：slug 以 /target 结尾）
  const byBasename = await prisma.note.findMany({
    where: { OR: rest1.map(t => ({ slug: { endsWith: `/${t}` } })) },
    select: { slug: true }
  })
  const basenameMap = new Map<string, string>()
  for (const n of byBasename) {
    const base = n.slug.split('/').pop()!
    if (!basenameMap.has(base)) basenameMap.set(base, n.slug)
  }
  const rest2 = rest1.filter(t => !basenameMap.has(t))
  for (const t of rest1) if (basenameMap.has(t)) map.set(t, basenameMap.get(t)!)
  if (!rest2.length) return map

  // 第三级：aliases 匹配（metadata JSONB array_contains）
  const byAlias = await prisma.note.findMany({
    where: { OR: rest2.map(t => ({ metadata: { path: ['aliases'], array_contains: [t] } })) },
    select: { slug: true, metadata: true }
  })
  const aliasOwners = new Map<string, string>()
  for (const n of byAlias) {
    const aliases = Array.isArray((n.metadata as any)?.aliases) ? (n.metadata as any).aliases : []
    for (const a of aliases) {
      if (typeof a === 'string' && rest2.includes(a) && !aliasOwners.has(a)) {
        aliasOwners.set(a, n.slug)
      }
    }
  }
  for (const t of rest2) if (aliasOwners.has(t)) map.set(t, aliasOwners.get(t)!)
  return map
}

// PG 的 text/JSONB 字段不接受 NUL 字节（0x00，错误码 22021），递归剥离
function sanitizeValue(v: any): any {
  if (typeof v === 'string') return v.replace(/\0/g, '')
  if (Array.isArray(v)) return v.map(sanitizeValue)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, sanitizeValue(val)]))
  }
  return v
}

/**
 * frontmatter 宽松解析（gray-matter 失败时的兜底）。
 * Obsidian 导出的 YAML 常含非法写法：flow 数组里出现 @types、.d.ts 这类保留字/特殊开头项
 * →「missed comma between flow collection entries」。解析失败若整段当正文，
 * YAML 原文（aliases/maturity/tags/created…）会被渲染进笔记正文（用户实际踩到）。
 * 这里逐行提取常见结构：key: [a, b] / key:\n - item / key: value。
 */
function lenientParseFrontmatter(raw: string): { data: Record<string, any>; content: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)
  if (!m) return { data: {}, content: raw }
  const data: Record<string, any> = {}
  let lastKey: string | null = null
  for (const line of cap(m, 1).split(/\r?\n/)) {
    if (!line.trim()) continue
    const listItem = /^\s+-\s?(.*)$/.exec(line)
    if (listItem && lastKey) {
      const arr = Array.isArray(data[lastKey]) ? (data[lastKey] as any[]) : []
      const item = cap(listItem, 1).trim().replace(/^["']|["']$/g, '')
      if (item) arr.push(item)
      data[lastKey] = arr
      continue
    }
    const kv = /^([\w.-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) { lastKey = null; continue }
    const key = cap(kv, 1)
    const val = cap(kv, 2).trim()
    const flow = /^\[(.*)\]$/.exec(val)
    if (flow) {
      data[key] = cap(flow, 1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      lastKey = key
      continue
    }
    if (val === '') { data[key] = null; lastKey = key; continue }
    data[key] = val.replace(/^["']|["']$/g, '')
    lastKey = key
  }
  return { data, content: raw.slice(m[0].length) }
}

/** 仅剥离 frontmatter 块（不做任何解析），保证正文不含 YAML 原文 */
function stripFrontmatterBlock(raw: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(raw)
  return m ? raw.slice(m[0].length) : raw
}

/**
 * 解析单个 Markdown 文件并入库（watcher 与批量导入共用）
 * 返回值：true = 内容确实变化并已入库；false = 内容未变被跳过或处理失败
 */
export async function processMarkdownFile(filePath: string): Promise<boolean> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    // 读取后立即剥离 NUL 字节，避免 PostgreSQL 写入失败
    const cleanContent = fileContent.replace(/\0/g, '')
    const relativePath = path.relative(path.resolve(process.cwd(), 'content/vault'), filePath)
    const slug = relativePath.replace(/\.md$/, '').replace(/\\/g, '/')

    // gray-matter 容错：frontmatter 解析失败时正文仍完整入库（metadata 为空）
    let frontmatter: Record<string, any> = {}
    let rawMarkdown = cleanContent
    try {
      const parsed = matter(cleanContent)
      frontmatter = sanitizeValue(parsed.data)
      rawMarkdown = parsed.content
    } catch (e) {
      // 解析失败兜底：① 宽松解析尽力提取字段（tags/maturity 等仍可用）；
      // ② 正文必须剥离 frontmatter 块 —— 否则 YAML 原文会被整段渲染进笔记正文
      const lenient = lenientParseFrontmatter(cleanContent)
      frontmatter = sanitizeValue(lenient.data)
      rawMarkdown = lenient.content
      if (!Object.keys(frontmatter).length) rawMarkdown = stripFrontmatterBlock(rawMarkdown)
      console.warn(`[garden] markdown: frontmatter 解析失败，宽松解析兜底（提取 ${Object.keys(frontmatter).length} 个字段）${filePath}:`, (e as Error).message)
    }

    // ── 内容未变则直接返回（2026-09-22 服务器失联事故后的加固）─────────────
    // 同步工具/编辑器只改 mtime、或应用重启触发全量重同步时，会为同一内容反复触发
    // change 事件。原先的比对在渲染之后，意味着每个事件都要跑一遍 unified + shiki 高亮，
    // 一次性几百个文件的重渲染叠加成内存峰值（1.6G 服务器会被拖到 SSH 都无响应）。
    // 这里在渲染前做严格比对：正文相同 **且** frontmatter 键值相同才跳过；
    // 任一处不同仍走完整流程（metadata 用排序键比较——PostgreSQL jsonb 不保留键序）。
    // RENDER_VERSION：渲染管线本身升级（如 wikilink URL 编码修复）时递增 ——
    // metadata 里存有上次渲染的版本号，版本不同则强制重渲染一次，让修复触达已入库内容。
    // v3：支持 [单方括号引用] 与 obsidian 协议链接渲染为站内链接（不入图谱）
    // v4：obsidian 链接整条替换为 markdown 链接 —— 管线对 markdown 内嵌 HTML 是转义显示
    //     的（rehype-raw 未启用），改写 <a> 标签的 href 会整段变字面量 + 目录栏乱码
    // v5：markdown 内嵌的 <a href> 标签（zrw 笔记大量站内/外链写成 HTML 形式）统一转
    //     markdown 链接，否则全部转义显示
    const RENDER_VERSION = 5
    const metaWithRv = { ...frontmatter, __rv: RENDER_VERSION }
    try {
      const existing = await prisma.note.findUnique({
        where: { slug },
        select: { content: true, metadata: true }
      })
      const normKeys = (o: unknown) => {
        const rec = (o ?? {}) as Record<string, unknown>
        return JSON.stringify(rec, Object.keys(rec).sort())
      }
      const existingRv = Number((existing?.metadata as Record<string, unknown> | null)?.__rv ?? 0)
      if (existing && existing.content === rawMarkdown && normKeys(existing.metadata) === normKeys(metaWithRv) && existingRv === RENDER_VERSION) {
        console.log(`[garden] markdown: 内容未变，跳过重渲染 ${slug}`)
        return false
      }
    } catch (e) {
      // 比对失败不影响主流程（继续走完整解析入库）
      console.warn(`[garden] markdown: 内容比对失败，按变更处理 ${slug}:`, (e as Error).message)
    }

    const title = frontmatter.title || path.basename(slug)
    // 成熟度（文档 10.5 治理机制）：
    //   ① frontmatter 显式合法值 → 人工值，直接采用；
    //   ② 显式非法值 → 告警并改走自动判定（旧版静默回退 SEEDLING，会把整库填平成幼苗）；
    //   ③ 缺省 → 按模板契约完成度自动判定（maturity-sync，全量重算会用双口径入链统一修正）。
    const explicitRaw = frontmatter.maturity == null ? undefined : String(frontmatter.maturity).trim().toUpperCase()
    if (explicitRaw && !(MATURITY_VALUES as readonly string[]).includes(explicitRaw)) {
      console.warn(`[garden] markdown: 非法 maturity "${frontmatter.maturity}"（${slug}），改走自动判定`)
    }
    const fmTags: string[] = Array.isArray(frontmatter.tags)
      ? frontmatter.tags.filter((t: unknown): t is string => typeof t === 'string')
      : []
    const maturityJudged = await computeMaturityForNote({
      slug,
      title,
      tags: fmTags,
      markdown: cleanContent,
      created: typeof frontmatter.created === 'string' ? frontmatter.created : undefined,
      explicit: explicitRaw && (MATURITY_VALUES as readonly string[]).includes(explicitRaw) ? explicitRaw : undefined,
      locked: frontmatter['maturity-locked'] === true
    })
    const maturity: MaturityValue = maturityJudged.value
    const isPublished = frontmatter.published !== false
    const summary = buildSummary(rawMarkdown)
    const readingTime = estimateReadingTime(rawMarkdown)

    const wikiLinkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g
    const outgoingTargets: string[] = []
    let match
    while ((match = wikiLinkRegex.exec(rawMarkdown)) !== null) {
      outgoingTargets.push(cap(match, 1).trim())
    }

    // 第一遍：批量解析每个 target 对应的真实 slug（精确 / basename / aliases 三级）
    const slugMap = await resolveTargetSlugs(outgoingTargets)

    // ① 单方括号引用（[Java内存模型]）：用户约定不入图谱，仅正文可点击跳转。
    //    目标存在 → 站内链接；不存在 → 保持原文本。
    //    必须在 wikilink 转换之前：转换产物 [text](url) 同为单括号形式，后处理会误伤。
    //    排除任务列表（[ ]/[x]）、脚注（[^1]）、纯数字引用；**代码块/行内代码一律跳过**
    //    （代码示例里的 [name]、[status] 占位符不能被改成链接）。
    const bareNames = new Set<string>()
    const codeSplitRe = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g
    const bareSegments = rawMarkdown.split(codeSplitRe)
    bareSegments.forEach((seg, i) => {
      if (i % 2 === 1) return // 代码段
      for (const m of seg.matchAll(/(?<!\[)\[([^\[\]\n]+)\](?!\])/g)) {
        const name = cap(m, 1).trim()
        if (!name || name.toLowerCase() === 'x' || name.startsWith('^') || /^\d+$/.test(name)) continue
        bareNames.add(name)
      }
    })
    let stageMarkdown = rawMarkdown
    if (bareNames.size) {
      const bareMap = await resolveTargetSlugs([...bareNames])
      stageMarkdown = bareSegments.map((seg, i) => {
        if (i % 2 === 1) return seg
        return seg.replace(/(?<!\[)\[([^\[\]\n]+)\](?!\])/g, (whole, name: string) => {
          const t = name.trim()
          if (!bareNames.has(t)) return whole
          const real = bareMap.get(t)
          return real ? `[${name}](/notes/${real.split('/').map(encodeURIComponent).join('/')})` : whole
        })
      }).join('')
    }

    // 第二遍：href 使用真实 slug，未解析到的保留原 target 路径
    // 输出 URL 必须逐段 encodeURIComponent：slug 常含空格（如「MOC - 多线程」），
    // 未编码的空格会让 CommonMark 拒绝解析 → 整个链接按字面量显示（用户截图反馈）
    let processedMarkdown = stageMarkdown.replace(wikiLinkRegex, (_, target, display) => {
      const text = display || target
      const realSlug = slugMap.get(target.trim())
      const href = (realSlug ?? target.trim()).split('/').map(encodeURIComponent).join('/')
      return `[${text}](/notes/${href})`
    })

    // ② obsidian 协议链接（<a href="obsidian://open?file=X">text</a>）：网页端没有
    //    Obsidian 客户端，点击只会失败；且渲染管线对 markdown 内嵌 HTML 是转义显示的
    //    （rehype-raw 未启用）—— 改写 <a> 标签 href 会让整段变字面量 + 目录栏 &#x3C;a> 乱码。
    //    这里整条替换为 markdown 链接。仅渲染层转换，不建 NoteLink（用户约定不入图谱）。
    //    同样跳过代码块/行内代码。
    const obsNames = new Set<string>()
    const obsSegments = processedMarkdown.split(codeSplitRe)
    obsSegments.forEach((seg, i) => {
      if (i % 2 === 1) return
      for (const m of seg.matchAll(/<a\s[^>]*href="obsidian:\/\/open\?file=([^"]*)"[^>]*>[\s\S]*?<\/a>/g)) {
        let f = cap(m, 1)
        try { f = decodeURIComponent(f) } catch { /* 保留原值 */ }
        obsNames.add(f.replace(/\.md$/i, ''))
      }
    })
    if (obsNames.size) {
      const obsMap = await resolveTargetSlugs([...obsNames])
      processedMarkdown = obsSegments.map((seg, i) => {
        if (i % 2 === 1) return seg
        return seg.replace(
          /<a\s[^>]*href="obsidian:\/\/open\?file=([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
          (whole, file: string, inner: string) => {
            let f = file
            try { f = decodeURIComponent(f) } catch { /* 保留原值 */ }
            const real = obsMap.get(f.replace(/\.md$/i, ''))
            if (!real) return whole
            const href = '/notes/' + real.split('/').map(encodeURIComponent).join('/')
            // 链接文本剥离内嵌 HTML（markdown 链接文本里再放 HTML 会被转义显示）
            const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
              || f.split('/').pop() || '链接'
            return `[${text}](${href})`
          }
        )
      }).join('')
    }

    // ③ markdown 内嵌的 <a href="..."> 标签：渲染管线对内嵌 HTML 是转义显示的
    //    （rehype-raw 未启用），zrw 笔记里大量站内/外链直接写成 HTML 形式 → 全部转义显示。
    //    统一转为 markdown 链接（跳过代码块/行内代码；页内锚点保留）。
    const aSegments = processedMarkdown.split(codeSplitRe)
    processedMarkdown = aSegments.map((seg, i) => {
      if (i % 2 === 1) return seg
      return seg.replace(/<a\s([^>]*)href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi, (whole, pre: string, href: string, post: string, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        if (!text) return whole
        const cleanHref = href.trim()
        if (!cleanHref || cleanHref.startsWith('#')) return whole // 页内锚点保留
        return `[${text}](${cleanHref})`
      })
    }).join('')

    // 手写链接的 URL 含未转义空格时，CommonMark 同样会拒绝解析（整段按字面量显示）
    const safeLinksMarkdown = processedMarkdown.replace(/\]\(([^()\n]+)\)/g, (whole, url: string) =>
      url.includes(' ') ? `](${url.split(' ').join('%20')})` : whole
    )

    const htmlResult = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype)
      .use(rehypeKatex)
      // 类型收敛（非功能改动）：@shikijs/rehype 4.4.2 自带了**另一份 unified**
      // （node_modules/@shikijs/rehype/node_modules/unified），其 Plugin 泛型与项目主版本的
      // 不是同一份类型标识 —— 结构上兼容、名义上不可赋值。运行时参数完全匹配（主题名）。
      // 上游 dedupe unified 之后应移除该断言。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .use(rehypeShiki as any, { theme: 'nord' })
      .use(rehypeStringify)
      .process(safeLinksMarkdown)

    const htmlContent = htmlResult.toString()

    // maxWait/timeout 放宽：大笔记处理链长，避免高负载下事务启动超时（P2028）
    await prisma.$transaction(async (tx) => {
      // 内容比对：应用重启时 watcher 全量重同步（内容未变），不应刷新 updatedAt——
      // 否则每次重启所有笔记时间都被重置为当天。仅内容真实变化才更新时间戳。
      const existing = await tx.note.findUnique({
        where: { slug },
        select: { content: true, htmlContent: true }
      })
      const contentChanged = !existing || existing.content !== rawMarkdown || existing.htmlContent !== htmlContent

      const note = await tx.note.upsert({
        where: { slug },
        update: {
          title,
          content: rawMarkdown,
          htmlContent,
          summary,
          readingTime,
          maturity,
          isPublished,
          metadata: metaWithRv,
          ...(contentChanged ? { updatedAt: new Date() } : {})
        },
        create: {
          slug,
          title,
          content: rawMarkdown,
          htmlContent,
          summary,
          readingTime,
          maturity,
          isPublished,
          metadata: metaWithRv
        }
      })

      if (Array.isArray(frontmatter.tags)) {
        await tx.noteTag.deleteMany({ where: { noteId: note.id } })
        // 过滤非字符串/空标签（如 tags: [123]），防止 Prisma 类型错误拖垮整篇
        const tagNames = frontmatter.tags.filter((t: unknown): t is string => typeof t === 'string' && !!t.trim())
        for (const tagName of tagNames) {
          const tag = await tx.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName }
          })
          await tx.noteTag.create({
            data: { noteId: note.id, tagId: tag.id }
          })
        }
      }

      await tx.noteLink.deleteMany({ where: { sourceId: note.id } })
      // 同一笔记内重复引用同一目标只建一条边（NoteLink 复合主键 sourceId+targetId 唯一）
      for (const target of new Set(outgoingTargets)) {
        const realSlug = slugMap.get(target)
        if (realSlug && realSlug !== slug) {
          const targetNote = await tx.note.findUnique({ where: { slug: realSlug }, select: { id: true } })
          if (targetNote) {
            await tx.noteLink.create({
              data: { sourceId: note.id, targetId: targetNote.id }
            })
          }
        }
      }
    }, { maxWait: 10000, timeout: 30000 })

    // 入库完成：失效 tree/graph 进程内缓存，保证读接口拿到最新数据
    invalidateGardenCache()
    return true
  } catch (e) {
    // 单篇失败不中断 watcher 事件链，记录日志继续
    console.error(`[garden] markdown: 处理失败 ${filePath}:`, e)
    return false
  }
}

export async function removeMarkdownFile(filePath: string) {
  const relativePath = path.relative(path.resolve(process.cwd(), 'content/vault'), filePath)
  const slug = relativePath.replace(/\.md$/, '').replace(/\\/g, '/')
  await prisma.note.delete({ where: { slug } }).catch(() => {})
  invalidateGardenCache()
}
