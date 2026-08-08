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

type MaturityValue = 'SEEDLING' | 'GROWING' | 'EVERGREEN'

// 将 WikiLink 目标解析为数据库真实 slug：
// 1) 精确匹配完整 slug；2) basename 匹配（Obsidian 最短文件名）；3) aliases 匹配（metadata JSONB）
async function resolveTargetSlug(target: string): Promise<string | null> {
  const exact = await prisma.note.findUnique({ where: { slug: target }, select: { slug: true } })
  if (exact) return exact.slug

  const byBasename = await prisma.note.findFirst({
    where: { slug: { endsWith: `/${target}` } },
    select: { slug: true }
  })
  if (byBasename) return byBasename.slug

  const byAlias = await prisma.note.findFirst({
    where: { metadata: { path: ['aliases'], array_contains: [target] } },
    select: { slug: true }
  })
  return byAlias?.slug ?? null
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

export async function processMarkdownFile(filePath: string) {
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

    const title = frontmatter.title || path.basename(slug)
    const maturity = ((frontmatter.maturity || 'SEEDLING') as string).toUpperCase() as MaturityValue
    const isPublished = frontmatter.published !== false

    const wikiLinkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g
    const outgoingTargets: string[] = []
    let match
    while ((match = wikiLinkRegex.exec(rawMarkdown)) !== null) {
      outgoingTargets.push(match[1].trim())
    }

    // 第一遍：解析每个 target 对应的真实 slug（Set 去重减少查询）
    const slugMap = new Map<string, string | null>()
    for (const target of new Set(outgoingTargets)) {
      slugMap.set(target, await resolveTargetSlug(target))
    }

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
      const note = await tx.note.upsert({
        where: { slug },
        update: {
          title,
          content: rawMarkdown,
          htmlContent,
          maturity,
          isPublished,
          metadata: frontmatter,
          updatedAt: new Date()
        },
        create: {
          slug,
          title,
          content: rawMarkdown,
          htmlContent,
          maturity,
          isPublished,
          metadata: frontmatter
        }
      })

      if (Array.isArray(frontmatter.tags)) {
        await tx.noteTag.deleteMany({ where: { noteId: note.id } })
        for (const tagName of frontmatter.tags) {
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
  } catch (e) {
    // 单篇失败不中断 watcher 事件链，记录日志继续
    console.error(`[garden] markdown: 处理失败 ${filePath}:`, e)
  }
}

export async function removeMarkdownFile(filePath: string) {
  const relativePath = path.relative(path.resolve(process.cwd(), 'content/vault'), filePath)
  const slug = relativePath.replace(/\.md$/, '').replace(/\\/g, '/')
  await prisma.note.delete({ where: { slug } }).catch(() => {})
}
