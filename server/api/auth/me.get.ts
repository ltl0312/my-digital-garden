import { defineEventHandler } from 'h3'
import { getAuthKey } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const key = await getAuthKey(event)
  if (!key) return null
  return { id: key.id, role: key.role, label: key.label, isBuiltin: key.isBuiltin }
})
