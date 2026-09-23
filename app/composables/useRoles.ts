// 角色元数据与前端判定（移植自原型 ROLES / canToggleKey / canDeleteKey，spec 8.1–8.5）
// 注意：前端判定只负责「第一道门」（置灰 + 写明原因）；服务端二维校验才是权威。

export type Role = 'root' | 'admin' | 'user'

interface KeyLike {
  id: string
  role: string
  isBuiltin?: boolean
}

export const ROLES: Record<Role, { label: string; badge: string }> = {
  root: { label: '初始管理员', badge: 'text-amber-600 dark:text-amber-400' },
  admin: { label: '普通管理员', badge: 'text-garden-600 dark:text-garden-400' },
  user: { label: '普通用户', badge: 'text-slate-500 dark:text-slate-400' }
}

export const useRoles = () => {
  const { me } = useAuth()
  const actorRole = computed<Role>(() => (me.value?.role as Role) || 'user')
  const isRoot = computed(() => actorRole.value === 'root')
  // 管理能力：root 或 admin（user 只看「我的密钥」）
  const canManage = computed(() => actorRole.value === 'root' || actorRole.value === 'admin')

  const canCreateRole = (targetRole: string): boolean => {
    if (targetRole === 'root') return false // 内置唯一身份，任何人都不可再创建
    if (actorRole.value === 'root') return targetRole === 'admin' || targetRole === 'user'
    if (actorRole.value === 'admin') return targetRole === 'user'
    return false
  }

  const canToggleKey = (target: KeyLike): { ok: boolean; why?: string } => {
    if (target.id === me.value?.id) return { ok: false, why: '不能变更自己的密钥状态' }
    if (target.role === 'root' || target.isBuiltin) return { ok: false, why: '初始管理员不可被禁用' }
    if (actorRole.value === 'root') return { ok: true }
    if (actorRole.value === 'admin' && target.role === 'user') return { ok: true }
    return { ok: false, why: '普通管理员仅可管理普通用户密钥' }
  }

  const canDeleteKey = (target: KeyLike): { ok: boolean; why?: string } => {
    if (target.id === me.value?.id) return { ok: false, why: '不能删除自己正在使用的密钥' }
    if (target.role === 'root' || target.isBuiltin) return { ok: false, why: '初始管理员不可被删除' }
    if (actorRole.value === 'root') return { ok: true }
    if (actorRole.value === 'admin' && target.role === 'user') return { ok: true }
    return { ok: false, why: '普通管理员仅可管理普通用户密钥' }
  }

  // 变更他人权限等级（admin ⇄ user）：仅 root（初始管理员）可操作 —— 若 admin 也能改角色，
  // 它就能把自己提权到与 root 同级，三级体系会塌掉。root 自身与内置身份不可改，
  // 也不能改自己（否则把自己降级后系统再无 root）。与服务端 canChangeRole 逐条一致。
  const canChangeRoleKey = (target: KeyLike): { ok: boolean; why?: string } => {
    if (actorRole.value !== 'root') return { ok: false, why: '仅初始管理员可变更他人权限等级' }
    if (target.id === me.value?.id) return { ok: false, why: '不能变更自己的权限等级' }
    if (target.role === 'root' || target.isBuiltin) return { ok: false, why: '初始管理员的权限等级不可变更' }
    return { ok: true }
  }

  return { actorRole, isRoot, canManage, canCreateRole, canToggleKey, canDeleteKey, canChangeRoleKey }
}
