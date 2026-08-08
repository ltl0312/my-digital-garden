import { createError, defineEventHandler } from 'h3'
import { getAuthKey } from '../utils/auth'

const PUBLIC = ['/api/auth/verify', '/api/auth/me', '/api/auth/logout']

export default defineEventHandler(async (event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) return
  if (PUBLIC.some(p => path.startsWith(p))) return

  const key = await getAuthKey(event)
  if (!key) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  event.context.authKey = key
})
