import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import matter from 'gray-matter'
import { resolveVaultPath, stripNul } from '../../../utils/vault'
import { requireAdmin } from '../../../utils/auth'
import { invalidateGardenCache } from '../../../utils/cache'
import { prisma } from '../../../utils/db'
import { computeMaturityForNote } from '../../../utils/maturity-sync'

// 元数据编辑（标签 / 成熟度）：PATCH /api/vault/notes/<slug>
// body: { tags?: string[]; maturity?: 'SEEDLING' | 'GROWING' | 'EVERGREEN' | null }
//   - maturity 传 null = 删除 frontmatter 的 maturity 行 → 恢复自动判定
//     （frontmatter 显式值会被当作人工指定永久锁定，用户必须能退出锁定）
//   - 其余 frontmatter 字段原样保留；正文不动
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const parts = event.context.params?.slug
  const slug = Array.isArray(parts) ? parts.join('/') : parts
  if (!slug) throw createError({ statusCode: 400, message: 'Invalid Slug' })

  const body = (await readBody<{ tags?: unknown; maturity?: unknown }>(event)) || {}
  if (body.tags === undefined && body.maturity === undefined) {
    throw createError({ statusCode: 400, message: 'tags 或 maturity 至少提供一个' })
  }

  let tags: string[] | undefined
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      throw createError({ statusCode: 400, message: 'tags 必须是字符串数组' })
    }
    tags = (body.tags as unknown[])
      .filter((t): t is string => typeof t === 'string' && !!t.trim())
      .map(t => (t as string).trim())
    if (new Set(tags).size !== tags.length) {
      throw createError({ statusCode: 400, message: '标签不能重复' })
    }
    if (tags.some(t => t.length > 40)) {
      throw createError({ statusCode: 400, message: '单个标签过长（≤40 字符）' })
    }
  }

  let maturity: string | null | undefined
  if (body.maturity !== undefined) {
    if (body.maturity === null || body.maturity === '') {
      maturity = null // 恢复自动判定
    } else {
      const v = stripNul(String(body.maturity)).trim().toUpperCase()
      if (!['SEEDLING', 'GROWING', 'EVERGREEN'].includes(v)) {
        throw createError({ statusCode: 400, message: 'maturity 仅支持 SEEDLING / GROWING / EVERGREEN（或 null 恢复自动判定）' })
      }
      maturity = v
    }
  }

  let full: string
  try {
    full = resolveVaultPath(slug + '.md')
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  const existing = await fs.readFile(full, 'utf-8').catch(() => null)
  if (existing === null) throw createError({ statusCode: 404, message: '笔记不存在' })

  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(existing)
  } catch {
    throw createError({ statusCode: 400, message: 'frontmatter 解析失败，请先修复文件头部格式' })
  }
  const fm: Record<string, any> = { ...(parsed.data || {}) }

  if (tags !== undefined) {
    if (tags.length) fm.tags = tags
    else delete fm.tags
  }
  if (maturity !== undefined) {
    if (maturity === null) delete fm.maturity
    else fm.maturity = maturity
  }

  const finalContent = Object.keys(fm).length
    ? matter.stringify(parsed.content, fm)
    : parsed.content

  // 原子写入（与正文保存一致）
  const tmp = full + '.tmp'
  await fs.writeFile(tmp, finalContent, 'utf-8')
  await fs.rename(tmp, full)

  // ── 同步更新 DB：若只写文件、等 watcher 异步入库，前端会感知「改完不自动刷新」。
  // 这里立即落库（后续 watcher 重解析结果相同，幂等）。
  const noteRow = await prisma.note.findUnique({ where: { slug }, select: { id: true, title: true } })
  if (noteRow) {
    const effectiveTags = tags !== undefined
      ? tags
      : (Array.isArray(fm.tags) ? fm.tags.filter((t: unknown): t is string => typeof t === 'string' && !!t.trim()) : [])
    await prisma.$transaction(async (tx) => {
      if (maturity !== undefined) {
        let mv: string
        if (maturity === null) {
          // 恢复自动判定：与 watcher 同口径重判一次（explicit 置空、不锁定）
          const judged = await computeMaturityForNote({
            slug,
            title: noteRow.title,
            tags: effectiveTags,
            markdown: parsed.content,
            created: typeof fm.created === 'string' ? fm.created : undefined,
            explicit: undefined,
            locked: false
          })
          mv = judged.value
        } else {
          mv = maturity
        }
        await tx.note.update({ where: { id: noteRow.id }, data: { maturity: mv } })
      }
      if (tags !== undefined) {
        await tx.noteTag.deleteMany({ where: { noteId: noteRow.id } })
        for (const tagName of tags) {
          const tag = await tx.tag.upsert({ where: { name: tagName }, update: {}, create: { name: tagName } })
          await tx.noteTag.create({ data: { noteId: noteRow.id, tagId: tag.id } })
        }
      }
    }, { maxWait: 10000, timeout: 30000 })
  }

  invalidateGardenCache()
  return { ok: true, slug, tags: fm.tags ?? [], maturity: fm.maturity ?? null }
})
