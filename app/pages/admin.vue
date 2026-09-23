<script setup lang="ts">
import { Copy, Check, Eye, EyeOff, ShieldAlert, KeyRound, Plus, Trash2 } from 'lucide-vue-next'

const requestFetch = useRequestFetch()
const { me } = useAuth()
const { actorRole, isRoot, canManage, canCreateRole, canToggleKey, canDeleteKey, canChangeRoleKey } = useRoles()
const toast = useToast()
const { confirm } = useConfirm()

interface KeyRow {
  id: string
  label: string | null
  role: string
  isActive: boolean
  isBuiltin: boolean
  createdBy: string | null
  creatorLabel: string | null
  lastUsedAt: string | null
  createdAt: string
  key: string
}

const keys = ref<KeyRow[]>([])
const label = ref('')
const role = ref('user')
const submitting = ref(false)
// 生成结果强调面板（spec 5.6：结果以强调面板呈现 + 一键复制）
const created = ref<{ key: string; role: string; label: string } | null>(null)

// 打码态：默认全打码，逐行「显示」切换
const revealed = ref<Set<string>>(new Set())
const copiedField = ref('')

const loadKeys = async () => {
  keys.value = await requestFetch<KeyRow[]>('/api/admin/keys')
}
await loadKeys()

/** 打码：前 4 + 圆点 + 末 3（短密钥退化为全打码） */
const mask = (k: string) => (k && k.length > 8 ? `${k.slice(0, 4)}••••••${k.slice(-3)}` : '••••••••')

const myKey = computed(() => keys.value.find(k => k.id === me.value?.id) || null)

const copy = async (text: string, field: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copiedField.value = field
    setTimeout(() => { if (copiedField.value === field) copiedField.value = '' }, 1500)
    toast.success('已复制到剪贴板')
  } catch {
    toast.warn(`复制失败，请手动选择：${text}`)
  }
}

const toggleReveal = (id: string) => {
  const next = new Set(revealed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  revealed.value = next
}

/** 相对时间（spec 5.6：最近使用显示为相对时间） */
const rel = (iso: string | null) => {
  if (!iso) return '从未使用'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} 天前`
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

// 每个角色都能看到自己的权限边界（spec 8.4：✓ 可做 / ✗ 不可做 + 子说明）
const boundary = computed<{ ok: boolean; text: string; note?: string }[]>(() => {
  if (actorRole.value === 'root') {
    return [
      { ok: true, text: '查看全部密钥（含普通管理员与普通用户）' },
      { ok: true, text: '创建普通管理员 / 普通用户密钥' },
      { ok: true, text: '禁用 / 启用 / 删除普通管理员与普通用户密钥' },
      { ok: false, text: '禁用或删除自己正在使用的密钥', note: '防自锁：任何角色都不能让自己的密钥失效' },
      { ok: false, text: '再创建一个初始管理员', note: '初始管理员是内置唯一身份' }
    ]
  }
  if (actorRole.value === 'admin') {
    return [
      { ok: true, text: '查看自己 + 全部普通用户的密钥' },
      { ok: true, text: '创建普通用户密钥' },
      { ok: true, text: '禁用 / 启用 / 删除普通用户密钥' },
      { ok: false, text: '变更自己密钥的状态' },
      { ok: false, text: '查看或管理初始管理员 / 其他管理员的密钥', note: '可见范围之外，接口同样拒绝' }
    ]
  }
  return [
    { ok: true, text: '浏览全部笔记与知识图谱' },
    { ok: true, text: '在此查看自己的密钥、状态与创建者' },
    { ok: false, text: '创建、禁用或删除任何密钥', note: '密钥管理仅对初始管理员与普通管理员开放' }
  ]
})

const createKey = async () => {
  if (!label.value.trim() || submitting.value) return
  submitting.value = true
  try {
    const row = await $fetch<{ key: string; role: string }>('/api/admin/keys', {
      method: 'POST',
      body: { label: label.value.trim(), role: role.value }
    })
    created.value = { key: row.key, role: row.role, label: label.value.trim() }
    label.value = ''
    await loadKeys()
    toast.success('密钥已生成')
  } catch (e: any) {
    toast.error(e?.data?.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

const toggleKey = async (k: KeyRow) => {
  const guard = canToggleKey(k)
  if (!guard.ok) return
  const prev = k.isActive
  k.isActive = !prev // 乐观更新，失败回滚
  try {
    await $fetch(`/api/admin/keys/${k.id}`, { method: 'PATCH', body: { isActive: !prev } })
    toast.success(prev ? `已禁用「${k.label}」` : `已启用「${k.label}」`)
  } catch (e: any) {
    k.isActive = prev
    toast.error(e?.data?.message || '操作失败')
  }
}

const removeKey = async (k: KeyRow) => {
  const guard = canDeleteKey(k)
  if (!guard.ok) return
  const ok = await confirm({
    title: '删除密钥',
    message: `确定删除「${k.label}」的访问密钥？该用户将立即失去访问权限。`,
    detail: k.label || k.id,
    confirmText: '删除密钥',
    danger: true
  })
  if (!ok) return
  try {
    await $fetch(`/api/admin/keys/${k.id}`, { method: 'DELETE' })
    await loadKeys()
    toast.success('密钥已删除')
  } catch (e: any) {
    toast.error(e?.data?.message || '删除失败')
  }
}

// 权限等级变更（普通用户 ⇄ 普通管理员）：仅初始管理员可操作（前端置灰 + 服务端权威校验）。
// 乐观更新，失败回滚。
const changeRole = async (k: KeyRow, next: string) => {
  const guard = canChangeRoleKey(k)
  if (!guard.ok) { toast.error(guard.why || '无权操作'); return }
  if (k.role === next) return
  const prev = k.role
  k.role = next
  try {
    await $fetch(`/api/admin/keys/${k.id}`, { method: 'PATCH', body: { role: next } })
    toast.success(`已将「${k.label}」设为${next === 'admin' ? '普通管理员' : '普通用户'}`)
  } catch (e: any) {
    k.role = prev
    toast.error(e?.data?.message || '变更失败')
  }
}

const roleOptions = computed(() =>
  [{ value: 'user', label: '普通用户' }, { value: 'admin', label: '管理员' }]
    .filter(o => canCreateRole(o.value))
)

useHead({ title: '管理后台 · 拾光' })
</script>

<template>
  <div class="max-w-[880px] mx-auto px-4 sm:px-6 py-8">
    <h1 class="text-ds-2xl font-bold tracking-tight text-ink mb-1">管理后台</h1>
    <p class="text-ds-sm text-ink-3 mb-6">身份、密钥与权限边界</p>

    <!-- 我的密钥：所有角色可见（spec 8.4） -->
    <section class="mb-6 rounded-card border border-line bg-surface p-5">
      <h2 class="text-ds-lg font-semibold text-ink mb-4 flex items-center gap-2">
        <KeyRound class="w-4 h-4 text-accent" />我的密钥
      </h2>

      <!-- 身份卡 -->
      <div class="rounded-card border border-line bg-surface-2 p-4">
        <div class="flex flex-wrap items-start gap-x-8 gap-y-3">
          <div class="min-w-0">
            <p class="text-[12px] text-ink-3 mb-1">密钥</p>
            <div class="flex items-center gap-1.5">
              <code class="font-mono text-ds-sm text-ink-2">
                {{ myKey ? (revealed.has(myKey.id) ? myKey.key : mask(myKey.key)) : '—' }}
              </code>
              <button
                v-if="myKey"
                class="w-7 h-7 rounded-ctl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro"
                :title="revealed.has(myKey.id) ? '隐藏' : '显示'"
                :aria-label="revealed.has(myKey.id) ? '隐藏密钥' : '显示密钥'"
                @click="toggleReveal(myKey.id)"
              >
                <EyeOff v-if="revealed.has(myKey.id)" class="w-3.5 h-3.5" />
                <Eye v-else class="w-3.5 h-3.5" />
              </button>
              <button
                v-if="myKey"
                class="w-7 h-7 rounded-ctl flex items-center justify-center transition-colors duration-micro"
                :class="copiedField === 'mine' ? 'text-evergreen' : 'text-ink-3 hover:text-ink hover:bg-surface-3'"
                title="复制完整密钥"
                aria-label="复制完整密钥"
                @click="copy(myKey.key, 'mine')"
              >
                <Check v-if="copiedField === 'mine'" class="w-3.5 h-3.5" />
                <Copy v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            <p class="text-[12px] text-ink-3 mb-1">身份</p>
            <RoleBadge :role="actorRole" :builtin="!!myKey?.isBuiltin" />
          </div>

          <div>
            <p class="text-[12px] text-ink-3 mb-1">状态</p>
            <span class="inline-flex items-center gap-1.5 text-ds-sm">
              <span class="w-1.5 h-1.5 rounded-full" :class="myKey?.isActive ? 'bg-evergreen' : 'bg-danger'"></span>
              <span :class="myKey?.isActive ? 'text-evergreen' : 'text-danger'">{{ myKey?.isActive ? '启用' : '已禁用' }}</span>
            </span>
          </div>

          <div>
            <p class="text-[12px] text-ink-3 mb-1">创建者</p>
            <p class="text-ds-sm text-ink-2">{{ myKey?.creatorLabel || '内置' }}</p>
          </div>
        </div>

        <!-- 权限边界清单 -->
        <div class="mt-4 pt-4 border-t border-line">
          <p class="text-[12px] font-semibold text-ink-3 mb-2.5">权限边界</p>
          <PermissionList :items="boundary" />
        </div>
      </div>
    </section>

    <!-- 密钥管理：同一路由三种形态（spec 8.3） -->
    <template v-if="canManage">
      <section class="mb-6 rounded-card border border-line bg-surface p-5">
        <h2 class="text-ds-lg font-semibold text-ink mb-4">生成密钥</h2>

        <div class="flex flex-wrap items-end gap-3">
          <label class="flex-1 min-w-[180px]">
            <span class="block text-[12px] text-ink-3 mb-1.5">备注名</span>
            <input
              v-model="label"
              placeholder="如：朋友小明"
              class="w-full px-3 py-2 rounded-ctl bg-surface-2 border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
              @keyup.enter="createKey"
            />
          </label>

          <div>
            <span class="block text-[12px] text-ink-3 mb-1.5">角色</span>
            <div class="inline-flex items-center rounded-ctl border border-line bg-surface-2 p-0.5" role="group" aria-label="角色">
              <button
                v-for="o in roleOptions"
                :key="o.value"
                class="px-3 h-8 rounded-[6px] text-ds-sm transition-colors duration-micro"
                :class="role === o.value ? 'bg-accent text-[var(--accent-ink)] font-semibold' : 'text-ink-2 hover:bg-surface-3'"
                :aria-pressed="role === o.value"
                @click="role = o.value"
              >{{ o.label }}</button>
            </div>
          </div>

          <button
            class="px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
            :disabled="!label.trim() || submitting"
            @click="createKey"
          ><Plus class="w-3.5 h-3.5" />{{ submitting ? '生成中…' : '生成密钥' }}</button>
        </div>

        <!-- 生成结果：强调面板（含一键复制） -->
        <div
          v-if="created"
          class="mt-4 rounded-card border border-accent/35 bg-[var(--accent-soft)] p-4"
        >
          <p class="text-ds-sm font-semibold text-ink mb-2">
            已生成「{{ created.label }}」（{{ created.role === 'admin' ? '管理员' : '普通用户' }}）
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <code class="flex-1 min-w-[220px] px-3 py-2 rounded-ctl bg-surface border border-line font-mono text-ds-sm text-ink break-all">
              {{ created.key }}
            </code>
            <button
              class="px-3 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
              @click="copy(created.key, 'new')"
            >
              <Check v-if="copiedField === 'new'" class="w-3.5 h-3.5 text-evergreen" />
              <Copy v-else class="w-3.5 h-3.5" />复制
            </button>
          </div>
          <p class="mt-2 text-[12px] text-ink-3">密钥永久有效，上述列表中可随时禁用或删除。</p>
        </div>
      </section>

      <!-- admin 形态：把「看不到什么」讲出来（spec 8.3 设计决定） -->
      <p v-if="!isRoot" class="mb-4 text-[12px] text-ink-3 flex items-start gap-1.5">
        <ShieldAlert class="w-3.5 h-3.5 shrink-0 mt-0.5" />
        列表仅包含你自己的密钥与全部普通用户；初始管理员与其他管理员的密钥不在可见范围内。
      </p>

      <section class="rounded-card border border-line bg-surface p-5">
        <h2 class="text-ds-lg font-semibold text-ink mb-4">密钥列表（{{ keys.length }}）</h2>

        <!-- 手机（<640，交付物第 08 屏）：7 列表格在 390 宽下只能横向滚动，等于看不见后半截。
             改为卡片式 —— **每一列信息都仍在**，只是重排为「标题 + 角色 / 密钥 / 元信息 / 状态与操作」。
             权限收敛规则完全复用表格那一套（canChangeRoleKey / canToggleKey / canDeleteKey）。 -->
        <ul class="sm:hidden space-y-2" data-testid="key-cards">
          <li v-for="k in keys" :key="k.id" class="rounded-card border border-line bg-surface-2 p-3.5">
            <div class="flex items-start gap-2">
              <p class="flex-1 min-w-0 text-ds-sm font-semibold text-ink truncate">{{ k.label || '—' }}</p>
              <AppSelect
                v-if="canChangeRoleKey(k).ok"
                :model-value="k.role"
                size="sm"
                :options="[{ value: 'user', label: '普通用户' }, { value: 'admin', label: '普通管理员' }]"
                @update:model-value="(v: string) => changeRole(k, v)"
              />
              <span v-else class="shrink-0" :title="canChangeRoleKey(k).why">
                <RoleBadge :role="k.role" :builtin="k.isBuiltin" />
              </span>
            </div>

            <div class="mt-2 flex items-center gap-1 min-w-0">
              <code class="font-mono text-[12px] text-ink-2 truncate">{{ revealed.has(k.id) ? k.key : mask(k.key) }}</code>
              <button
                class="w-7 h-7 rounded-ctl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro shrink-0"
                :title="revealed.has(k.id) ? '隐藏' : '显示'"
                :aria-label="revealed.has(k.id) ? '隐藏密钥' : '显示密钥'"
                @click="toggleReveal(k.id)"
              >
                <EyeOff v-if="revealed.has(k.id)" class="w-3.5 h-3.5" />
                <Eye v-else class="w-3.5 h-3.5" />
              </button>
              <button
                class="w-7 h-7 rounded-ctl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro shrink-0"
                title="复制密钥"
                aria-label="复制密钥"
                @click="copy(k.key, k.id)"
              >
                <Check v-if="copiedField === k.id" class="w-3.5 h-3.5 text-evergreen" />
                <Copy v-else class="w-3.5 h-3.5" />
              </button>
            </div>

            <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
              <div class="min-w-0">
                <dt class="text-ink-3">创建者</dt>
                <dd class="text-ink-2 truncate">{{ k.creatorLabel || '内置' }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-ink-3">最近使用</dt>
                <dd class="text-ink-2 truncate">{{ rel(k.lastUsedAt) }}</dd>
              </div>
            </dl>

            <div class="mt-3 pt-3 border-t border-line flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <button
                  role="switch"
                  :aria-checked="k.isActive"
                  :aria-label="`${k.label} 的状态`"
                  :disabled="!canToggleKey(k).ok"
                  :title="canToggleKey(k).ok ? (k.isActive ? '点击禁用' : '点击启用') : canToggleKey(k).why"
                  class="relative inline-flex w-[38px] h-[22px] rounded-full border transition-colors duration-micro disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  :class="k.isActive ? 'bg-accent border-transparent' : 'bg-surface-3 border-line'"
                  @click="toggleKey(k)"
                >
                  <span
                    class="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white shadow-ds1 transition-[left] duration-base ease-dawn"
                    :style="{ left: k.isActive ? '19px' : '2px' }"
                  ></span>
                </button>
                <span class="text-[12px] truncate" :class="k.isActive ? 'text-evergreen' : 'text-danger'">
                  {{ k.isActive ? '启用' : '已禁用' }}
                </span>
              </div>

              <button
                v-if="canToggleKey(k).ok || canDeleteKey(k).ok"
                class="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-ctl text-[12px] text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-colors duration-micro disabled:cursor-not-allowed"
                :disabled="!canDeleteKey(k).ok"
                :title="canDeleteKey(k).ok ? '删除该密钥' : canDeleteKey(k).why"
                @click="removeKey(k)"
              >
                <Trash2 class="w-3.5 h-3.5" />删除
              </button>
              <span v-else class="shrink-0 text-[12px] text-ink-3 truncate" :title="canToggleKey(k).why">
                {{ canToggleKey(k).why }}
              </span>
            </div>
          </li>
        </ul>

        <div class="hidden sm:block overflow-x-auto -mx-5 px-5" data-testid="key-table">
          <table class="w-full text-ds-sm border-collapse">
            <thead>
              <tr class="text-left text-[12px] text-ink-3">
                <th class="py-2 pr-3 font-medium">备注</th>
                <th class="py-2 pr-3 font-medium">密钥</th>
                <th class="py-2 pr-3 font-medium">角色</th>
                <th class="py-2 pr-3 font-medium">状态</th>
                <th class="py-2 pr-3 font-medium">创建者</th>
                <th class="py-2 pr-3 font-medium">最近使用</th>
                <th class="py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="k in keys"
                :key="k.id"
                class="group border-t border-line transition-colors duration-micro hover:bg-surface-2"
              >
                <td class="py-2.5 pr-3 text-ink">{{ k.label || '—' }}</td>

                <!-- 密钥：默认打码 + 显示 / 复制 -->
                <td class="py-2.5 pr-3">
                  <div class="flex items-center gap-1">
                    <code class="font-mono text-[12px] text-ink-2">{{ revealed.has(k.id) ? k.key : mask(k.key) }}</code>
                    <button
                      class="w-6 h-6 rounded-ctl flex items-center justify-center text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink hover:bg-surface-3 transition-all duration-micro"
                      :title="revealed.has(k.id) ? '隐藏' : '显示'"
                      :aria-label="revealed.has(k.id) ? '隐藏密钥' : '显示密钥'"
                      @click="toggleReveal(k.id)"
                    >
                      <EyeOff v-if="revealed.has(k.id)" class="w-3.5 h-3.5" />
                      <Eye v-else class="w-3.5 h-3.5" />
                    </button>
                    <button
                      class="w-6 h-6 rounded-ctl flex items-center justify-center text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink hover:bg-surface-3 transition-all duration-micro"
                      title="复制密钥"
                      aria-label="复制密钥"
                      @click="copy(k.key, k.id)"
                    >
                      <Check v-if="copiedField === k.id" class="w-3.5 h-3.5 text-evergreen" />
                      <Copy v-else class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>

                <td class="py-2.5 pr-3">
                  <!-- 权限等级：仅初始管理员可改（普通用户 ⇄ 普通管理员），其余身份只读展示 -->
                  <AppSelect
                    v-if="canChangeRoleKey(k).ok"
                    :model-value="k.role"
                    size="sm"
                    :options="[{ value: 'user', label: '普通用户' }, { value: 'admin', label: '普通管理员' }]"
                    @update:model-value="(v: string) => changeRole(k, v)"
                  />
                  <span v-else :title="canChangeRoleKey(k).why">
                    <RoleBadge :role="k.role" :builtin="k.isBuiltin" />
                  </span>
                </td>

                <!-- 状态：switch 控件 -->
                <td class="py-2.5 pr-3">
                  <button
                    role="switch"
                    :aria-checked="k.isActive"
                    :aria-label="`${k.label} 的状态`"
                    :disabled="!canToggleKey(k).ok"
                    :title="canToggleKey(k).ok ? (k.isActive ? '点击禁用' : '点击启用') : canToggleKey(k).why"
                    class="relative inline-flex w-[38px] h-[22px] rounded-full border transition-colors duration-micro disabled:opacity-40 disabled:cursor-not-allowed"
                    :class="k.isActive ? 'bg-accent border-transparent' : 'bg-surface-3 border-line'"
                    @click="toggleKey(k)"
                  >
                    <span
                      class="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white shadow-ds1 transition-[left] duration-base ease-dawn"
                      :style="{ left: k.isActive ? '19px' : '2px' }"
                    ></span>
                  </button>
                </td>

                <td class="py-2.5 pr-3 text-[12px] text-ink-3">{{ k.creatorLabel || '内置' }}</td>
                <td class="py-2.5 pr-3 text-[12px] text-ink-3">{{ rel(k.lastUsedAt) }}</td>

                <!-- 行操作：默认半透明，悬停显形；不可操作项写明原因 -->
                <td class="py-2.5 whitespace-nowrap">
                  <span
                    v-if="!canToggleKey(k).ok && !canDeleteKey(k).ok"
                    class="text-[12px] text-ink-3"
                    :title="canDeleteKey(k).why || canToggleKey(k).why"
                  >{{ canToggleKey(k).why }}</span>
                  <button
                    v-else
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-ctl text-[12px] text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-micro disabled:cursor-not-allowed"
                    :disabled="!canDeleteKey(k).ok"
                    :title="canDeleteKey(k).ok ? '删除该密钥' : canDeleteKey(k).why"
                    @click="removeKey(k)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- user 形态：无权限页 + 两个出口（spec 8.3 / 8.5） -->
    <DeniedState v-else />
  </div>
</template>
