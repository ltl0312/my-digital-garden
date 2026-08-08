import { createError, defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'

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

  return note
})
