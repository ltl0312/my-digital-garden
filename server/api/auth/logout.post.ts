import { defineEventHandler } from 'h3'
import { clearAuthCookie } from '../../utils/auth'

export default defineEventHandler((event) => {
  clearAuthCookie(event)
  return { ok: true }
})
