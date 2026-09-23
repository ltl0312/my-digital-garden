import { createError, defineEventHandler } from 'h3'
import fs from 'fs/promises'
import matter from 'gray-matter'
import { prisma } from '../../utils/db'
import { resolveVaultPath } from '../../utils/vault'

export default defineEventHandler(async (event) => {
  const parts = event.context.params?.slug
  const slug = Array.isArray(parts) ? parts.join('/') : parts

  if (!slug) {
    throw createError({ statusCode: 400, message: 'Invalid Slug' })
  }

  const note = await prisma.note.findUnique({
    where: { slug },
    include: {
      tags: { include: { tag: true } },
      incoming: {
        include: {
          source: {
            select: { slug: true, title: true, summary: true, updatedAt: true }
          }
        }
      }
    }
  })

  if (!note || !note.isPublished) {
    throw createError({ statusCode: 404, message: 'Note Not Found' })
  }

  // maturity 是否为 frontmatter 显式人工值：DB 里存的是「判定/人工」的最终结果，
  // UI 无法据此区分「自动判定的 SEEDLING」与「人工锁定的 SEEDLING」——
  // 元数据编辑器若把自动值当人工值回显，保存时会把人工锁定意外写回 frontmatter
  // （实测：新建笔记会被再次锁死在幼苗）。故读原文件判定。
  let maturityExplicit = false
  try {
    const raw = await fs.readFile(resolveVaultPath(slug + '.md'), 'utf-8')
    const fm = matter(raw).data || {}
    maturityExplicit = fm.maturity != null && String(fm.maturity).trim() !== ''
  } catch { /* 文件读取失败时按非人工处理 */ }

  return { ...note, maturityExplicit }
})
