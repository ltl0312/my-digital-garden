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

export function buildSummary(markdown: string): string {
  return markdown.replace(/\s+/g, ' ').trim().slice(0, SUMMARY_LENGTH)
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
      console.warn(`[garden] markdown: frontmatter 解析失败，按纯正文处理 ${filePath}:`, (e as Error).message)
    }

    // ── 内容未变则直接返回（2026-09-22 服务器失联事故后的加固）─────────────
    // 同步工具/编辑器只改 mtime、或应用重启触发全量重同步时，会为同一内容反复触发
    // change 事件。原先的比对在渲染之后，意味着每个事件都要跑一遍 unified + shiki 高亮，
    // 一次性几百个文件的重渲染叠加成内存峰值（1.6G 服务器会被拖到 SSH 都无响应）。
    // 这里在渲染前做严格比对：正文相同 **且** frontmatter 键值相同才跳过；
    // 任一处不同仍走完整流程（metadata 用排序键比较——PostgreSQL jsonb 不保留键序）。
    try {
      const existing = await prisma.note.findUnique({
        where: { slug },
        select: { content: true, metadata: true }
      })
      const normKeys = (o: unknown) => {
        const rec = (o ?? {}) as Record<string, unknown>
        return JSON.stringify(rec, Object.keys(rec).sort())
      }
      if (existing && existing.content === rawMarkdown && normKeys(existing.metadata) === normKeys(frontmatter)) {
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
      outgoingTargets.push(match[1].trim())
    }

    // 第一遍：批量解析每个 target 对应的真实 slug（精确 / basename / aliases 三级）
    const slugMap = await resolveTargetSlugs(outgoingTargets)

    // 第二遍：href 使用真实 slug，未解析到的保留原 target 路径
    const processedMarkdown = rawMarkdown.replace(wikiLinkRegex, (_, target, display) => {
      const text = display || target
      const realSlug = slugMap.get(target.trim())
      return `[${text}](/notes/${realSlug ?? target.trim()})`
    })

    const htmlResult = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype)
      .use(rehypeKatex)
      .use(rehypeShiki, { theme: 'nord' })
      .use(rehypeStringify)
      .process(processedMarkdown)

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
          metadata: frontmatter,
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
          metadata: frontmatter
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
