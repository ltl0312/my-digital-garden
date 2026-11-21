import { createError, defineEventHandler } from 'h3'
import fs from 'fs/promises'
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import { prisma } from '../../utils/db'
import { resolveVaultPath } from '../../utils/vault'
// 领域解析唯一入口（显式领域 > 路径派生 > 兜底「其他」）
import { resolveDomain } from '#shared/domain'

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
            select: { slug: true, title: true, summary: true, updatedAt: true, domainLevel1: true }
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
  /**
   * 磁盘文件版本 = `${十进制毫秒 mtimeMs}:${sha256(文件全文).slice(0,16)}`，
   * 与 `PUT /api/vault/notes/<slug>` 的 baseVersion / 响应 version **完全同一算法**
   * （包括 hash 覆盖整个文件而不是 DB 里的正文：前端拿到的就是它，回传时必须逐字相等）。
   *
   * 详情页必须回传它：前端算不出 mtimeMs，没有这个字段就只能做无条件覆盖，
   * 「两个窗口同时编辑」就退化成后写者静默吞掉先写者。文件读不到时给 null
   * （DB 有行、磁盘无文件的失配状态），前端此时应禁用保存而不是报错。
   */
  let version: string | null = null
  try {
    const filePath = resolveVaultPath(slug + '.md')
    const raw = await fs.readFile(filePath, 'utf-8')
    const fm = matter(raw).data || {}
    maturityExplicit = fm.maturity != null && String(fm.maturity).trim() !== ''
    const st = await fs.stat(filePath)
    version = `${Math.round(st.mtimeMs)}:${createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16)}`
  } catch { /* 文件读取失败时按非人工处理、版本缺失 */ }

  // 领域在服务端解析好再回传：前端不再需要自己拼「显式领域优先」的规则，
  // 也避免逐处调用 domainOfSlug 时漏掉人工指定的领域（ArticleReader 的面包屑/反链就在用）。
  const domain = resolveDomain(note.slug, note.domainLevel1)
  return {
    ...note,
    maturityExplicit,
    /** 磁盘文件版本（`mtimeMs:sha256前16位`）；保存时原样回传为 baseVersion。null = 磁盘文件缺失 */
    version,
    /** 生效领域名（已归一） */
    domain: domain.domain,
    /** manual = 人工/审核指定；path = 目录派生；fallback = 两者皆无 */
    domainFrom: domain.from,
    /** 显式领域为空时，路径派生出的领域（用于 UI 说明「本来的目录位置」） */
    pathDomain: domain.pathDomain,
    dirPath: domain.dirPath,
    incoming: note.incoming.map(l => ({
      ...l,
      source: {
        ...l.source,
        domain: resolveDomain(l.source.slug, l.source.domainLevel1).domain
      }
    }))
  }
})
