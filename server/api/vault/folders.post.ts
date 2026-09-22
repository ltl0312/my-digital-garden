import { createError, defineEventHandler, readBody } from 'h3'
import fs from 'fs/promises'
import path from 'path'
import { resolveVaultPath, stripNul, isValidNodeName, normalizeVaultRel } from '../../utils/vault'
import { requireAdmin } from '../../utils/auth'
import { invalidateGardenCache } from '../../utils/cache'

// C1 新建文件夹（spec 8.6/8.8）：root / admin 可用；父目录可为 vault 根（''）
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = (await readBody<{ parent?: string; name?: string }>(event)) || {}
  const parent = normalizeVaultRel(stripNul(body.parent || ''))
  const name = (body.name || '').trim()
  if (!isValidNodeName(name)) throw createError({ statusCode: 400, message: 'Invalid folder name' })

  let parentFull: string
  let targetFull: string
  try {
    parentFull = resolveVaultPath(parent) // '' → vault 根（resolveVaultPath 允许）
    targetFull = resolveVaultPath(parent ? `${parent}/${name}` : name)
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid path' })
  }

  const st = await fs.stat(parentFull).catch(() => null)
  if (!st || !st.isDirectory()) throw createError({ statusCode: 404, message: 'Directory not found' })

  // 同目录重名一律拒绝（与新建笔记/粘贴共用同一条「文件名不可重复」规则，spec 8.8）
  const exists = await fs.stat(targetFull).then(() => true).catch(() => false)
  if (exists) throw createError({ statusCode: 409, message: '同名目录或文件已存在' })

  await fs.mkdir(targetFull) // recursive:false：父目录缺失即抛错（防御竞态）
  // 写操作后立即失效 tree/graph 缓存，避免前端刷新拿到 10s 内的旧树
  invalidateGardenCache()
  return { path: parent ? `${parent}/${name}` : name }
})
