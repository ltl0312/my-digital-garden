<script setup lang="ts">
import { Copy, Check, Eye, EyeOff, ShieldAlert, ShieldCheck, KeyRound, Plus, Trash2, Tags, Sparkles, Play, Bot, PlugZap, Info, AlertTriangle, ListChecks } from 'lucide-vue-next'

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
      { ok: true, text: '审核标签 / 领域自动分配建议（通过后才写入笔记）' },
      { ok: false, text: '禁用或删除自己正在使用的密钥', note: '防自锁：任何角色都不能让自己的密钥失效' },
      { ok: false, text: '再创建一个初始管理员', note: '初始管理员是内置唯一身份' }
    ]
  }
  if (actorRole.value === 'admin') {
    return [
      { ok: true, text: '查看自己 + 全部普通用户的密钥' },
      { ok: true, text: '创建普通用户密钥' },
      { ok: true, text: '禁用 / 启用 / 删除普通用户密钥' },
      { ok: true, text: '审核标签 / 领域自动分配建议（通过后才写入笔记）' },
      { ok: false, text: '变更自己密钥的状态' },
      { ok: false, text: '查看或管理初始管理员 / 其他管理员的密钥', note: '可见范围之外，接口同样拒绝' }
    ]
  }
  return [
    { ok: true, text: '浏览全部笔记与知识图谱' },
    { ok: true, text: '在此查看自己的密钥、状态与创建者' },
    { ok: false, text: '导入 / 新建 / 编辑 / 删除笔记（普通用户全程只读）', note: '所有写入接口均由全局中间件强制要求管理员身份' },
    { ok: false, text: '生成或审核标签 / 领域分配建议', note: '自动分配与审核仅对初始管理员与普通管理员开放' },
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

// ── 标签 · 领域自动分配与审核（需求：自动化分配 + 用户审核通过才生效） ──────────
// 本区块仅 root/admin 可见可操作；服务端每个接口都再过一遍 requireAdmin。
// 审核面板的开关放在 useSuggestionReview（跨页面单源），因为同一面板还要被
// 笔记操作面板的「重新判定」打开 —— 各持一个 ref 会互相打不开。
interface SuggestStats { pending: number; llm: { enabled: boolean; model: string } }
const { openReview } = useSuggestionReview()
const pendingCount = ref(0)
const generating = ref(false)
const pickerOpen = ref(false)
const llmStatus = ref<{ enabled: boolean; model: string }>({ enabled: false, model: '' })

/** 只读状态（待审数量 + AI 是否启用），走轻量 meta 接口，不进一次全表查询 */
const loadSuggestMeta = async () => {
  try {
    const res = await requestFetch<SuggestStats>('/api/admin/suggestions/meta')
    pendingCount.value = res.pending ?? 0
    llmStatus.value = res.llm || { enabled: false, model: '' }
  } catch {
    // 拉不到（如接口未部署）时不阻塞管理后台其它功能
    pendingCount.value = 0
  }
}
await loadSuggestMeta()

/**
 * 触发生成。scope:
 *   recent  = 最近导入/变更的笔记（默认；导入后也会自动排队，这里是手动补一脚）
 *   missing = 当前没有待审建议的笔记（整库补跑，已有建议的不覆盖）
 *   picked  = 指定的若干篇（这里用「当前待审列表为空」的整库路径代替多选）
 */
const generate = async (scope: 'recent' | 'missing') => {
  generating.value = true
  try {
    const body = scope === 'recent'
      ? { scope: 'recent', withinMinutes: 1440, immediate: true }
      : { scope: 'all' }
    const res = await $fetch<{ processed?: number; generated?: number; considered?: number; stats?: { emptyTags?: number } }>(
      '/api/admin/suggestions',
      { method: 'POST', body }
    )
    const n = scope === 'recent' ? (res.processed ?? 0) : (res.generated ?? 0)
    if (n > 0) {
      toast.success(`已生成 ${n} 条待审建议`)
    } else {
      toast.warn(scope === 'recent' ? '最近没有新入库或变更的笔记' : '所有笔记都已有待审建议')
    }
    await loadSuggestMeta()
    openReview()
  } catch (e: any) {
    toast.error(e?.data?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

const onReviewed = async () => {
  await loadSuggestMeta()
  await refreshNuxtData(['vault-tree', 'sidebar-tags', 'sidebar-graph', 'graph-data', 'notes-recent'])
}

/**
 * 多选器生成完成后的落点：只需刷新待审数量徽标。
 * 面板本身由 useSuggestionReview.reviewForSlugs 负责打开并收敛到刚判定的那几篇 ——
 * 这里不再自己查一次 id（早期版本在此重复实现了一遍，是两份逻辑漂移的来源）。
 */
const onPicked = async () => {
  await loadSuggestMeta()
}

// ── AI 增强设置（标签/领域判定的 LLM 配置）────────────────────────────────────
// 需求：密钥与开关在设置界面里自己配，不用去改 .env、也不用重启。
// 安全约定：接口**永不回传密钥明文**，只给「是否已配置」与末 4 位；密钥在服务端加密落库。
interface AiPublic {
  enabled: boolean
  baseUrl: string
  model: string
  hasKey: boolean
  keyTail: string
  source: 'db' | 'env' | 'none'
  keyBroken: boolean
  usable: boolean
  envFallback: boolean
}
const aiPub = ref<AiPublic | null>(null)
const aiForm = ref({ enabled: false, baseUrl: '', model: '', apiKey: '' })
const aiSaving = ref(false)
const aiTesting = ref(false)
const aiTest = ref<{ ok: boolean; message: string; detail?: string } | null>(null)

const applyAiPublic = (p: AiPublic) => {
  aiPub.value = p
  aiForm.value = { enabled: p.enabled, baseUrl: p.baseUrl || '', model: p.model || '', apiKey: '' }
}

const loadAiSettings = async () => {
  try {
    const res = await requestFetch<{ llm: AiPublic }>('/api/admin/settings/llm')
    applyAiPublic(res.llm)
  } catch {
    // 接口不可用（如未部署）时不阻塞后台其它区块
    aiPub.value = null
  }
}
await loadAiSettings()

/** 表单里待提交的字段（密钥留空＝沿用已存的那把，绝不能把密钥洗掉） */
const aiBody = (extra: Record<string, unknown> = {}) => {
  const body: Record<string, unknown> = {
    enabled: aiForm.value.enabled,
    baseUrl: aiForm.value.baseUrl.trim(),
    model: aiForm.value.model.trim(),
    ...extra
  }
  if (aiForm.value.apiKey.trim()) body.apiKey = aiForm.value.apiKey.trim()
  return body
}

/** 统一提交入口（「保存」「开关」「清除密钥」共用，避免三份 body 拼装各自漂移） */
const persistAi = async (extra: Record<string, unknown> = {}, okText?: string): Promise<boolean> => {
  aiSaving.value = true
  aiTest.value = null
  try {
    const res = await $fetch<{ llm: AiPublic }>('/api/admin/settings/llm', { method: 'PUT', body: aiBody(extra) })
    applyAiPublic(res.llm)
    toast.success(okText || (res.llm.usable ? '已保存，AI 增强已生效' : '已保存'))
    await loadSuggestMeta()
    return true
  } catch (e: any) {
    toast.error(e?.data?.message || '保存失败')
    return false
  } finally {
    aiSaving.value = false
  }
}

const saveAiSettings = () => persistAi()

/**
 * 开关**点击即保存**。
 * 早前开关只改本地表单、必须再点「保存」才落库 —— 用户翻开关后一刷新就回到原值，
 * 表现为「显示已开启但未生效，刷新后自动关闭」。开关的语义本就是即时生效，
 * 所以这里直接提交；失败则把开关位置回滚，不留下与库里不一致的假象。
 */
const toggleAi = async () => {
  const prev = aiForm.value.enabled
  const next = !prev
  aiForm.value.enabled = next
  const ok = await persistAi({}, next ? '已开启 AI 增强' : '已关闭 AI 增强')
  if (!ok) aiForm.value.enabled = prev
}

/** 表单与「已保存值」是否有差异（用于提示未保存，避免以为改了就已生效） */
const aiDirty = computed(() => {
  const p = aiPub.value
  if (!p) return false
  return aiForm.value.enabled !== p.enabled
    || aiForm.value.baseUrl.trim() !== (p.baseUrl || '')
    || aiForm.value.model.trim() !== (p.model || '')
    || !!aiForm.value.apiKey.trim()
})

/**
 * 状态文案：把「未开启 / 没填密钥 / 没填模型 / 密钥解不开 / 有未保存修改 / 生效中」区分开。
 * 早前只有一句「已开启但未生效（缺密钥或模型名）」，用户明明填了密钥也会看到它 —— 误导。
 */
const aiStatus = computed<{ tone: 'ok' | 'warn' | 'off'; text: string }>(() => {
  const p = aiPub.value
  if (p?.usable) return { tone: 'ok', text: aiDirty.value ? 'AI 增强生效中（有未保存的修改）' : 'AI 增强生效中' }
  if (!aiForm.value.enabled) return { tone: 'off', text: '未开启（仅规则引擎）' }
  const typedKey = !!aiForm.value.apiKey.trim()
  if (p?.keyBroken && !typedKey) return { tone: 'warn', text: '已开启，但已存密钥无法解密 —— 请重新填写密钥' }
  if (!typedKey && !p?.hasKey) return { tone: 'warn', text: '已开启，但还没填 API 密钥' }
  if (!aiForm.value.model.trim()) return { tone: 'warn', text: '已开启，但还没填模型名' }
  if (aiDirty.value) return { tone: 'warn', text: '已开启（有未保存的修改，点「保存」后生效）' }
  return { tone: 'warn', text: '已开启但未生效 —— 建议点「测试连接」确认地址与密钥可用' }
})

const clearAiKey = async () => {
  const ok = await confirm({
    title: '清除 API 密钥',
    message: '清除后 AI 增强将立即失效（标签与领域判定回退为纯规则引擎）。此操作不可撤销，需要重新填写密钥。',
    confirmText: '清除密钥',
    danger: true
  })
  if (!ok) return
  await persistAi({ clearKey: true }, '密钥已清除')
}

/** 用**表单里当前的值**测试连接（可先验证再保存） */
const testAi = async () => {
  aiTesting.value = true
  aiTest.value = null
  try {
    const body: Record<string, unknown> = {
      baseUrl: aiForm.value.baseUrl.trim(),
      model: aiForm.value.model.trim()
    }
    if (aiForm.value.apiKey.trim()) body.apiKey = aiForm.value.apiKey.trim()
    const res = await $fetch<{ ok: boolean; status: number; message: string; detail: string }>(
      '/api/admin/settings/llm-test',
      { method: 'POST', body }
    )
    aiTest.value = { ok: res.ok, message: res.message, detail: res.detail }
  } catch (e: any) {
    aiTest.value = { ok: false, message: e?.data?.message || '测试请求失败' }
  } finally {
    aiTesting.value = false
  }
}

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

    <!-- 标签 · 领域自动分配与审核：仅 root/admin 可见（服务端同样 requireAdmin 兜底） -->
    <section v-if="canManage" class="mb-6 rounded-card border border-line bg-surface p-5">
      <h2 class="text-ds-lg font-semibold text-ink mb-1 flex items-center gap-2">
        <Tags class="w-4 h-4 text-accent" />标签 · 领域自动分配
      </h2>
      <p class="text-[12px] text-ink-3 mb-4">
        自动判定只生成<b>待审草稿</b>；审核通过后才会写入笔记 —— 标签写进 vault 文件的 frontmatter，领域写进笔记属性（不改文件路径，因此旧链接不会失效）。
      </p>

      <!-- 状态行 -->
      <div class="rounded-card border border-line bg-surface-2 p-4">
        <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p class="text-[12px] text-ink-3 mb-1">待审建议</p>
            <p class="text-ds-sm text-ink flex items-center gap-2">
              <span
                class="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-semibold"
                :class="pendingCount ? 'bg-accent text-[var(--accent-ink)]' : 'bg-surface-3 text-ink-3'"
              >{{ pendingCount }}</span>
              <span v-if="pendingCount" class="text-ink-2">条等待审核</span>
              <span v-else class="text-ink-3">暂无待审</span>
            </p>
          </div>

          <div>
            <p class="text-[12px] text-ink-3 mb-1">判定引擎</p>
            <p class="text-ds-sm text-ink-2 flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5" :class="llmStatus.enabled ? 'text-accent' : 'text-ink-3'" />
              {{ llmStatus.enabled ? `规则 + AI（${llmStatus.model}）` : '规则引擎（未配置 AI）' }}
            </p>
          </div>
        </div>

        <!-- 操作 -->
        <div class="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-2">
          <button
            class="px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
            :disabled="generating"
            @click="openReview()"
          ><Tags class="w-3.5 h-3.5" />审核待审建议<span v-if="pendingCount">（{{ pendingCount }}）</span></button>

          <!-- 「指定笔记」入口：多选器（可搜索 / 按领域与标签筛选 / 只看还没判定的 / 跨页多选） -->
          <button
            class="px-4 py-2 rounded-ctl text-ds-sm font-semibold border border-accent/45 bg-[var(--accent-soft)] text-ink inline-flex items-center gap-1.5 hover:bg-surface-3 transition-colors duration-micro disabled:opacity-45"
            :disabled="generating"
            title="自己挑几篇笔记来判定（支持搜索、按领域与标签筛选、跨页多选）"
            @click="pickerOpen = true"
          ><ListChecks class="w-3.5 h-3.5" />选择笔记生成…</button>

          <button
            class="px-4 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5 disabled:opacity-45"
            :disabled="generating"
            title="为最近 24 小时内入库或变更的笔记生成建议"
            @click="generate('recent')"
          ><Play class="w-3.5 h-3.5" />{{ generating ? '生成中…' : '为最近笔记生成' }}</button>

          <button
            class="px-4 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5 disabled:opacity-45"
            :disabled="generating"
            title="为所有还没有待审建议的笔记补跑（已有建议的不会被覆盖）"
            @click="generate('missing')"
          ><Play class="w-3.5 h-3.5" />整库补跑</button>
        </div>

        <p class="mt-2 text-[12px] text-ink-3">
          导入笔记后会自动排队生成；自动判定<b>不会发明新标签</b>，只从 vault 既有标签里选 —— 需要新标签时在审核面板里手动添加。
        </p>
      </div>
    </section>

    <!-- AI 增强设置：开关与密钥都在这里配，不用改 .env、也不用重启 -->
    <section v-if="canManage" class="mb-6 rounded-card border border-line bg-surface p-5">
      <h2 class="text-ds-lg font-semibold text-ink mb-1 flex items-center gap-2">
        <Bot class="w-4 h-4 text-accent" />AI 增强设置
      </h2>
      <p class="text-[12px] text-ink-3 mb-4">
        让大模型参与标签与领域的判定（增强规则引擎）。<b>不配置也能用</b>——规则引擎独立工作；
        配置后判定更准，但会产生上游 API 费用。配置立即生效，无需重启。
      </p>

      <!-- 状态 -->
      <div class="rounded-card border border-line bg-surface-2 p-4 mb-4">
        <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p class="text-[12px] text-ink-3 mb-1">当前状态</p>
            <p class="text-ds-sm flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full"
                :class="aiStatus.tone === 'ok' ? 'bg-evergreen' : (aiStatus.tone === 'warn' ? 'bg-growing' : 'bg-ink-3')"></span>
              <span :class="aiStatus.tone === 'ok' ? 'text-evergreen font-medium' : (aiStatus.tone === 'warn' ? 'text-growing' : 'text-ink-3')">
                {{ aiStatus.text }}
              </span>
            </p>
          </div>

          <div v-if="aiPub?.hasKey">
            <p class="text-[12px] text-ink-3 mb-1">已存密钥</p>
            <p class="text-ds-sm text-ink-2 font-mono">••••••{{ aiPub.keyTail }}</p>
          </div>

          <div v-if="aiPub">
            <p class="text-[12px] text-ink-3 mb-1">配置来源</p>
            <p class="text-ds-sm text-ink-2">
              {{ aiPub.source === 'db' ? '本页保存的设置' : aiPub.source === 'env' ? '环境变量（TAG_LLM_*）' : '未配置' }}
            </p>
          </div>
        </div>

        <p v-if="aiPub?.keyBroken" class="mt-3 flex items-start gap-1.5 text-[12px] text-danger">
          <AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
          已存的密钥无法解密（通常是 AUTH_SECRET 变更过）—— 请重新填写密钥后保存。
        </p>
        <p v-else-if="aiPub?.envFallback && aiPub?.source === 'db' && !aiPub?.hasKey" class="mt-3 flex items-start gap-1.5 text-[12px] text-ink-3">
          <Info class="w-3.5 h-3.5 shrink-0 mt-0.5" />
          环境变量里还有一份配置，本页未填密钥时会回退使用它。
        </p>
      </div>

      <!-- 表单 -->
      <div class="space-y-3">
        <!-- 用 div 而不是 label 包开关：<button> 是 labelable 元素，label 会把点击再转发一次，
             有触发两次 toggle（净效果＝没变）的风险。开关自身即时保存，见 toggleAi。 -->
        <div class="flex items-center gap-3 select-none">
          <button
            type="button"
            role="switch"
            :aria-checked="aiForm.enabled"
            aria-label="启用 AI 增强"
            :disabled="aiSaving"
            class="relative inline-flex w-[38px] h-[22px] shrink-0 rounded-full border transition-colors duration-micro disabled:opacity-50"
            :class="aiForm.enabled ? 'bg-accent border-transparent' : 'bg-surface-3 border-line'"
            @click="toggleAi"
          >
            <span
              class="absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white shadow-ds1 transition-[left] duration-base ease-dawn"
              :style="{ left: aiForm.enabled ? '19px' : '2px' }"
            ></span>
          </button>
          <span class="text-ds-sm text-ink">启用 AI 增强<span class="text-ink-3">（切换即保存）</span></span>
        </div>

        <label class="block">
          <span class="block text-[12px] text-ink-3 mb-1.5">API 地址（OpenAI 兼容）</span>
          <input
            v-model="aiForm.baseUrl"
            placeholder="https://api.deepseek.com/v1"
            class="w-full px-3 py-2 rounded-ctl bg-surface-2 border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
          />
        </label>

        <label class="block">
          <span class="block text-[12px] text-ink-3 mb-1.5">模型名</span>
          <input
            v-model="aiForm.model"
            placeholder="deepseek-chat"
            class="w-full px-3 py-2 rounded-ctl bg-surface-2 border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
          />
        </label>

        <label class="block">
          <span class="block text-[12px] text-ink-3 mb-1.5">
            API 密钥
            <span v-if="aiPub?.hasKey" class="text-ink-3">（已配置，留空表示不修改）</span>
          </span>
          <input
            v-model="aiForm.apiKey"
            type="password"
            autocomplete="new-password"
            :placeholder="aiPub?.hasKey ? '留空则沿用已保存的密钥' : 'sk-...'"
            class="w-full px-3 py-2 rounded-ctl bg-surface-2 border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
          />
          <span class="block mt-1.5 text-[12px] text-ink-3 flex items-start gap-1.5">
            <ShieldCheck class="w-3.5 h-3.5 shrink-0 mt-0.5" />
            密钥在服务端<b>加密后</b>才写入数据库（加密密钥来自 AUTH_SECRET，不在库里），且接口永不回传明文。
          </span>
        </label>
      </div>

      <!-- 操作 -->
      <div class="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-2">
        <button
          class="px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
          :disabled="aiSaving || aiTesting"
          @click="saveAiSettings"
        >{{ aiSaving ? '保存中…' : '保存' }}</button>

        <button
          class="px-4 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5 disabled:opacity-45"
          :disabled="aiTesting || aiSaving"
          title="用当前表单里的地址与密钥试一次（不保存也能测）"
          @click="testAi"
        ><PlugZap class="w-3.5 h-3.5" />{{ aiTesting ? '测试中…' : '测试连接' }}</button>

        <button
          v-if="aiPub?.hasKey"
          class="px-4 py-2 rounded-ctl text-ds-sm border border-danger/40 bg-surface text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-colors duration-micro disabled:opacity-45"
          :disabled="aiSaving || aiTesting"
          @click="clearAiKey"
        ><Trash2 class="w-3.5 h-3.5" />清除密钥</button>
      </div>

      <!-- 测试结果 -->
      <div
        v-if="aiTest"
        class="mt-3 rounded-card border p-3"
        :class="aiTest.ok ? 'border-evergreen/40 bg-[color-mix(in_srgb,var(--evergreen)_8%,transparent)]' : 'border-danger/40 bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]'"
      >
        <p class="text-ds-sm flex items-start gap-1.5" :class="aiTest.ok ? 'text-evergreen' : 'text-danger'">
          <Check v-if="aiTest.ok" class="w-4 h-4 shrink-0 mt-0.5" />
          <AlertTriangle v-else class="w-4 h-4 shrink-0 mt-0.5" />
          {{ aiTest.message }}
        </p>
        <p v-if="aiTest.detail" class="mt-1.5 text-[12px] text-ink-3 font-mono break-all">{{ aiTest.detail }}</p>
      </div>
    </section>

    <!-- 审核面板挂在 default 布局根部（全局浮层），这里不再挂一份 —— 面板状态在 useSuggestionReview -->

    <!-- user 形态：无权限页 + 两个出口（spec 8.3 / 8.5） -->
    <DeniedState v-else />

    <!-- 笔记多选器：指定哪些笔记做判定（生成完成后自动打开审核面板并只看这几篇）。
         ⚠️ 必须放在 v-if/v-else 链**之外**：插在 `v-if="canManage"` 的 </template> 与
         `<DeniedState v-else />` 之间会让 v-else 失去相邻的 v-if，Vue 编译期直接报
         「v-else/v-else-if has no adjacent v-if or v-else-if」——整页 500。
         注意 nuxt typecheck **查不出**这类模板编译错误，只能靠真正加载页面发现。 -->
    <SuggestionPickerDialog v-model:open="pickerOpen" @generated="onPicked" />
  </div>
</template>
