<script setup lang="ts">
// AI 全库审计面板：限定范围 → 扫描 → 看建议 → （可选）让 AI 直接执行（仅初始管理员）
//
// 三条来自需求的硬约束，都在这里体现：
//   1. 范围可限定：文件夹 / 标签 / 领域 / 关键词 / 条数上限，条件之间是 AND。
//   2. 建议与执行分离：默认只出报告；勾选后点「执行」才写库，且执行前服务端会
//      **无条件整库备份**（响应里回传 backupId，可在上面的备份面板里回滚）。
//   3. 只有能机械执行的建议才给勾选框；纯判断类建议（action=null）只展示不可执行 ——
//      这比让用户勾了之后收到「无法执行」更诚实。
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Loader2,
  Plus, ScanSearch, Sparkles, X
} from 'lucide-vue-next'
// 领域候选与侧栏「领域」面板同源（规则唯一份在 shared/graph-domain.ts），这里只做派生
import { buildDomainFacets } from '~/composables/useFacets'
import type { TreeNodeLike } from '~/composables/useNameRule'

interface AuditAction {
  type: 'append-section' | 'add-tags' | 'set-domain'
  heading?: string
  body?: string
  tags?: string[]
  domain?: string
}
interface AuditIssue {
  id: string
  slug: string
  noteTitle: string
  kind: 'add' | 'modify' | 'fix'
  title: string
  detail: string
  severity: 'low' | 'medium' | 'high'
  action: AuditAction | null
  applied: boolean
  appliedAt: string | null
  error?: string
}
interface AuditRun {
  id: string
  createdAt: string
  scope: Record<string, unknown>
  actor: string
  model: string
  noteCount: number
  scannedCount: number
  failedCount: number
  failReasons?: string[]
  issues: AuditIssue[]
  complete: boolean
  error?: string
  backupId?: string
}
interface ScopePreview {
  matched: number
  willScan: number
  limit: number
  sample: Array<{ slug: string; title: string }>
}

const requestFetch = useRequestFetch()
const toast = useToast()
const { confirm } = useConfirm()

// ── 范围 ────────────────────────────────────────────────────────────────────
const folders = ref<string[]>([])
const tags = ref<string[]>([])
const domains = ref<string[]>([])
const keyword = ref('')
const limit = ref(20)

const folderInput = ref('')
const tagInput = ref('')
const domainInput = ref('')

const dirOptions = ref<Array<{ value: string; label: string }>>([])
const tagOptions = ref<Array<{ value: string; label: string }>>([])
const domainOptions = ref<Array<{ value: string; label: string }>>([])

const addChip = (list: typeof folders, val: string) => {
  const v = val.trim()
  if (!v) return
  if (!list.value.includes(v)) list.value = [...list.value, v]
}
const removeChip = (list: typeof folders, val: string) => {
  list.value = list.value.filter(x => x !== val)
}

/**
 * 模板里 ref 会被自动解包（`folders` 是 `string[]` 而不是 `Ref<string[]>`），
 * 所以不能直接在模板里调 `addChip(folders, …)` —— 那会把数组当 ref 传进去。
 * 这里为三个列表各包一层，模板只调这些。
 */
const addFolder = (v: string) => addChip(folders, v)
const removeFolder = (v: string) => removeChip(folders, v)
const addTag = (v: string) => addChip(tags, v)
const removeTag = (v: string) => removeChip(tags, v)
const addDomain = (v: string) => addChip(domains, v)
const removeDomain = (v: string) => removeChip(domains, v)

/**
 * 目录 / 标签 / 领域的候选项都从**既有只读接口**取，避免手打错名字。
 *
 * 三个数据源的实际形状（都踩过一遍才对上）：
 *   · `GET /api/vault/tree` → `{ tree: TreeNode[] }`（不是裸数组，也不是 `{ nodes }`）
 *   · `GET /api/tags`       → **裸数组** `[{ name, count }]`
 *   · 领域没有独立接口 —— 与侧栏「领域」面板同源，用 `buildDomainFacets` 从树里派生
 *     （知识区的一级子目录即领域；规则唯一份在 `shared/graph-domain.ts`）。
 */
const loadOptions = async () => {
  try {
    const [treeRes, tagRes] = await Promise.all([
      requestFetch<{ tree: TreeNodeLike[] }>('/api/vault/tree'),
      requestFetch<Array<{ name: string; count: number }>>('/api/tags')
    ])
    const tree = treeRes?.tree || []

    // 文件夹候选：全部目录路径（含嵌套），升序排列便于查找
    const dirs: string[] = []
    const walk = (nodes: TreeNodeLike[], base: string) => {
      for (const n of nodes || []) {
        if (n.type !== 'dir') continue
        const p = base ? `${base}/${n.name}` : n.name
        dirs.push(p)
        if (n.children) walk(n.children, p)
      }
    }
    walk(tree, '')
    dirOptions.value = dirs.sort().map(d => ({ value: d, label: d }))

    // 标签候选：全部标签（含 0 篇的死标签也留着 —— 审计「该补什么标签」时要能选到它们）
    const t = [...(Array.isArray(tagRes) ? tagRes : [])].sort((a, b) => b.count - a.count)
    tagOptions.value = t.map(x => ({ value: x.name, label: `${x.name}（${x.count}）` }))

    // 领域候选：与侧栏同源派生
    const total = t.reduce((a, x) => a + x.count, 0)
    domainOptions.value = buildDomainFacets(tree, total)
      .filter(f => f.name !== '其他')
      .map(f => ({ value: f.name, label: `${f.name}（${f.count}）` }))
  } catch {
    // 候选项加载失败不影响手打条件，静默降级
  }
}

// ── 预览 / 运行 ─────────────────────────────────────────────────────────────
const preview = ref<ScopePreview | null>(null)
const previewing = ref(false)
const running = ref(false)
const run = ref<AuditRun | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const scopeBody = () => ({
  folders: folders.value,
  tags: tags.value,
  domains: domains.value,
  keyword: keyword.value.trim(),
  limit: limit.value
})

const doPreview = async () => {
  previewing.value = true
  try {
    const res = await requestFetch<{ preview: ScopePreview }>(
      `/api/admin/audit/preview?folders=${encodeURIComponent(folders.value.join(','))}` +
      `&tags=${encodeURIComponent(tags.value.join(','))}` +
      `&domains=${encodeURIComponent(domains.value.join(','))}` +
      `&keyword=${encodeURIComponent(keyword.value.trim())}` +
      `&limit=${limit.value}`
    )
    preview.value = res.preview
  } catch (e: any) {
    toast.error(e?.data?.message || '预览失败')
  } finally {
    previewing.value = false
  }
}

const stopPoll = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

const poll = (id: string) => {
  stopPoll()
  pollTimer = setInterval(async () => {
    try {
      const res = await requestFetch<{ run: AuditRun }>(`/api/admin/audit/runs/${encodeURIComponent(id)}`)
      run.value = res.run
      if (res.run.complete) {
        stopPoll()
        running.value = false
        if (res.run.error) toast.error(`审计中断：${res.run.error}`)
        else toast.success(`审计完成：${res.run.scannedCount} 篇、${res.run.issues.length} 条建议`)
      }
    } catch {
      // 单次轮询失败不终止：网络抖动时继续等下一轮
    }
  }, 2500)
}

const start = async () => {
  if (!preview.value?.matched) {
    await doPreview()
  }
  const matched = preview.value?.matched || 0
  if (!matched) { toast.warn('当前筛选条件下没有匹配的笔记'); return }
  const ok = await confirm({
    title: '开始 AI 审计？',
    message: `将逐篇调用模型检查 ${Math.min(matched, limit.value)} 篇笔记，找出需要补充或修改的地方。**只出建议，不改任何笔记**。`,
    detail: `每次调用都会消耗上游 token；模型越强、篇数越多，费用越高。`,
    confirmText: '开始扫描'
  })
  if (!ok) return

  running.value = true
  run.value = null
  try {
    const res = await requestFetch<{ id: string }>('/api/admin/audit/runs', {
      method: 'POST',
      body: scopeBody()
    })
    poll(res.id)
  } catch (e: any) {
    running.value = false
    toast.error(e?.data?.message || '发起审计失败')
  }
}

// ── 执行建议 ────────────────────────────────────────────────────────────────
const picked = ref<Set<string>>(new Set())
const applying = ref(false)

const executable = computed(() => (run.value?.issues || []).filter(i => !!i.action && !i.applied))
const allPicked = computed(() => executable.value.length > 0 && executable.value.every(i => picked.value.has(i.id)))

const togglePick = (id: string) => {
  const next = new Set(picked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked.value = next
}

const toggleAll = () => {
  picked.value = allPicked.value ? new Set() : new Set(executable.value.map(i => i.id))
}

const apply = async () => {
  if (!run.value) return
  const ids = [...picked.value]
  if (!ids.length) { toast.warn('请先勾选要执行的建议'); return }
  const ok = await confirm({
    title: `让 AI 执行这 ${ids.length} 条建议？`,
    message: '执行会**直接改写 vault 里的笔记文件**。服务端会先做一次整库备份，执行后可用它回滚。',
    detail: '备份完成后才开始写入；备份失败则一条都不会执行。',
    confirmText: '备份并执行',
    danger: true
  })
  if (!ok) return

  applying.value = true
  try {
    const res = await requestFetch<{
      backupId: string
      results: Array<{ issueId: string; ok: boolean; message: string }>
    }>(`/api/admin/audit/runs/${encodeURIComponent(run.value.id)}/apply`, {
      method: 'POST',
      body: { issueIds: ids }
    })
    const okCount = res.results.filter(r => r.ok).length
    const bad = res.results.filter(r => !r.ok)
    if (bad.length) toast.warn(`已执行 ${okCount} 条，${bad.length} 条失败：${bad[0]?.message || ''}`)
    else toast.success(`已执行 ${okCount} 条（执行前备份 ${res.backupId}）`)
    // 重新取一次报告，让 applied 状态与失败原因落到界面上
    const fresh = await requestFetch<{ run: AuditRun }>(`/api/admin/audit/runs/${encodeURIComponent(run.value.id)}`)
    run.value = fresh.run
    picked.value = new Set()
    await refreshNuxtData()
  } catch (e: any) {
    toast.error(e?.data?.message || '执行失败')
  } finally {
    applying.value = false
  }
}

const kindLabel = (k: string) => k === 'add' ? '补充' : k === 'modify' ? '改写' : '修正'
const kindClass = (k: string) =>
  k === 'add' ? 'border-evergreen/40 text-evergreen'
    : k === 'modify' ? 'border-growing/40 text-growing'
      : 'border-danger/40 text-danger'

const sevClass = (s: string) =>
  s === 'high' ? 'text-danger' : s === 'medium' ? 'text-growing' : 'text-ink-3'

const actionLabel = (a: AuditAction | null) => {
  if (!a) return '仅建议（不可自动执行）'
  if (a.type === 'append-section') return `追加小节「${a.heading}」`
  if (a.type === 'add-tags') return `补标签 ${a.tags?.join('、') || ''}`
  return `改领域为「${a.domain}」`
}

/** 每条建议的详情默认折叠，避免几十条一起铺开 */
const openDetail = ref<Set<string>>(new Set())
const toggleDetail = (id: string) => {
  const next = new Set(openDetail.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openDetail.value = next
}

onMounted(loadOptions)
onBeforeUnmount(stopPoll)
</script>

<template>
  <section class="mb-6 rounded-card border border-line bg-surface p-5" data-testid="audit-panel">
    <h2 class="text-ds-lg font-semibold text-ink mb-1 flex items-center gap-2">
      <ScanSearch class="w-4 h-4 text-accent" />AI 全库审计
    </h2>
    <p class="text-[12px] text-ink-3 mb-4">
      让模型逐篇读正文，指出**需要补充或修改**的地方（缺小节、结论缺失、表述含糊、明显错误），
      并给出可直接执行的改法。默认只出建议；要动手时服务端会先整库备份。
    </p>

    <!-- 范围 -->
    <div class="rounded-card border border-line bg-surface-2 p-4 mb-4 space-y-3">
      <p class="text-[12px] text-ink-3">不填任何条件＝整库（受条数上限约束）。多个条件之间是「同时满足」。</p>

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <p class="text-[12px] text-ink-3 mb-1">文件夹</p>
          <div class="flex items-center gap-1.5">
            <AppSelect v-model="folderInput" size="sm" class="flex-1 min-w-0" :options="[{ value: '', label: '选择目录…' }, ...dirOptions]" />
            <button class="px-2 py-1.5 rounded-ctl border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro" @click="addFolder(folderInput); folderInput = ''">
              <Plus class="w-3.5 h-3.5" />
            </button>
          </div>
          <div v-if="folders.length" class="flex flex-wrap gap-1 mt-1.5">
            <span v-for="f in folders" :key="f" class="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border border-line text-ink-2">
              {{ f }}<button @click="removeFolder(f)"><X class="w-2.5 h-2.5" /></button>
            </span>
          </div>
        </div>

        <div>
          <p class="text-[12px] text-ink-3 mb-1">标签</p>
          <div class="flex items-center gap-1.5">
            <AppSelect v-model="tagInput" size="sm" class="flex-1 min-w-0" :options="[{ value: '', label: '选择标签…' }, ...tagOptions]" />
            <button class="px-2 py-1.5 rounded-ctl border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro" @click="addTag(tagInput); tagInput = ''">
              <Plus class="w-3.5 h-3.5" />
            </button>
          </div>
          <div v-if="tags.length" class="flex flex-wrap gap-1 mt-1.5">
            <span v-for="t in tags" :key="t" class="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border border-line text-ink-2">
              {{ t }}<button @click="removeTag(t)"><X class="w-2.5 h-2.5" /></button>
            </span>
          </div>
        </div>

        <div>
          <p class="text-[12px] text-ink-3 mb-1">领域</p>
          <div class="flex items-center gap-1.5">
            <AppSelect v-model="domainInput" size="sm" class="flex-1 min-w-0" :options="[{ value: '', label: '选择领域…' }, ...domainOptions]" />
            <button class="px-2 py-1.5 rounded-ctl border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro" @click="addDomain(domainInput); domainInput = ''">
              <Plus class="w-3.5 h-3.5" />
            </button>
          </div>
          <div v-if="domains.length" class="flex flex-wrap gap-1 mt-1.5">
            <span v-for="d in domains" :key="d" class="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border border-line text-ink-2">
              {{ d }}<button @click="removeDomain(d)"><X class="w-2.5 h-2.5" /></button>
            </span>
          </div>
        </div>

        <div>
          <p class="text-[12px] text-ink-3 mb-1">关键词（标题或正文包含）</p>
          <input
            v-model="keyword"
            placeholder="如：缓存 / 索引"
            class="w-full px-3 py-2 rounded-ctl bg-surface border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3 pt-1">
        <label class="text-[12px] text-ink-3">
          <span class="block mb-1">最多扫描篇数（1–200）</span>
          <input
            v-model.number="limit"
            type="number"
            min="1"
            max="200"
            class="w-[110px] px-2.5 py-1.5 rounded-ctl bg-surface border border-line text-ds-sm text-ink font-mono focus:outline-none focus:border-accent/60"
          />
        </label>
        <button
          class="px-3 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro disabled:opacity-45"
          :disabled="previewing"
          @click="doPreview"
        >{{ previewing ? '统计中…' : '看看会扫多少篇' }}</button>
        <button
          class="px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
          :disabled="running"
          data-testid="audit-start"
          @click="start"
        >
          <Loader2 v-if="running" class="w-3.5 h-3.5 animate-spin" /><Sparkles v-else class="w-3.5 h-3.5" />
          {{ running ? '扫描中…' : '开始审计' }}
        </button>
      </div>

      <p v-if="preview" class="text-[12px] text-ink-2">
        匹配 <b class="font-mono">{{ preview.matched }}</b> 篇，本次将扫描
        <b class="font-mono">{{ preview.willScan }}</b> 篇（上限 {{ preview.limit }}）。
        <span v-if="preview.sample.length" class="text-ink-3">
          例如：{{ preview.sample.slice(0, 3).map(s => s.title).join(' · ') }}
        </span>
      </p>
    </div>

    <!-- 进度 -->
    <div v-if="running && !run" class="flex items-center gap-2 text-ds-sm text-ink-2 py-3">
      <Loader2 class="w-4 h-4 animate-spin text-accent" />正在逐篇分析，报告完成后自动显示…
    </div>

    <!-- 报告 -->
    <div v-if="run" data-testid="audit-report">
      <div class="rounded-card border border-line bg-surface-2 p-3 mb-3">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-ink-3">
          <span>模型 <b class="text-ink-2">{{ run.model }}</b></span>
          <span>匹配 {{ run.noteCount }} 篇 · 已扫 {{ run.scannedCount }} 篇</span>
          <span v-if="run.failedCount" class="text-growing">模型失败 {{ run.failedCount }} 篇</span>
          <span v-if="run.failedCount" class="text-ink-3">失败原因见下</span>
          <span>{{ run.issues.length }} 条建议</span>
          <span v-if="run.backupId" class="text-evergreen">执行前备份 {{ run.backupId }}</span>
          <span v-if="!run.complete" class="inline-flex items-center gap-1 text-accent">
            <Loader2 class="w-3 h-3 animate-spin" />进行中
          </span>
        </div>
        <p v-if="run.error" class="mt-2 flex items-start gap-1.5 text-[12px] text-danger">
          <AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />{{ run.error }}
        </p>
      </div>
      <!-- 失败原因必须可见：只有一个「失败 59 篇」的数字，用户无从判断是超时、限流还是输出被截断
           （线上第一次跑审计就是 59/60 全失败，最后靠容器日志才查出是 max_tokens 截断）。 -->
      <div
        v-if="run.failedCount && run.failReasons?.length"
        data-testid="audit-fail-reasons"
        class="rounded-card border border-line bg-surface-2 p-3 mb-3"
      >
        <p class="text-[12px] text-ink-3 mb-1">模型失败原因（最多记 8 条）：</p>
        <ul class="space-y-0.5">
          <li v-for="(r, i) in run.failReasons" :key="i" class="text-[12px] text-ink-2 font-mono break-all">
            · {{ r }}
          </li>
        </ul>
        <p class="mt-1.5 text-[12px] text-ink-3">
          常见原因：输出被截断（已自动放大重试一次）、上游超时或限流、模型名或密钥不对。
        </p>
      </div>

      <div v-if="!run.issues.length && run.complete" class="text-ds-sm text-ink-3 py-3">
        这次没发现需要处理的问题。{{ run.failedCount ? `（另有 ${run.failedCount} 篇模型调用失败，结论不完整）` : '' }}
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <button
            class="px-2.5 py-1.5 rounded-ctl text-[12px] border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro disabled:opacity-45"
            :disabled="!executable.length"
            @click="toggleAll"
          >{{ allPicked ? '全不选' : '全选可执行' }}</button>
          <button
            class="px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
            :disabled="applying || !picked.size"
            data-testid="audit-apply"
            @click="apply"
          >
            <Loader2 v-if="applying" class="w-3.5 h-3.5 animate-spin" /><Check v-else class="w-3.5 h-3.5" />
            {{ applying ? '执行中…' : `执行选中的 ${picked.size} 条` }}
          </button>
          <span class="text-[12px] text-ink-3">执行前会自动整库备份；纯建议类条目不可执行。</span>
        </div>

        <div class="space-y-2">
          <div
            v-for="i in run.issues"
            :key="i.id"
            class="rounded-card border border-line bg-surface-2 px-3 py-2.5"
          >
            <div class="flex items-start gap-2">
              <input
                v-if="i.action && !i.applied"
                type="checkbox"
                class="mt-1 w-3.5 h-3.5 shrink-0 accent-[var(--accent)]"
                :checked="picked.has(i.id)"
                @change="togglePick(i.id)"
              />
              <span v-else class="mt-1 w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                <Check v-if="i.applied" class="w-3.5 h-3.5 text-evergreen" />
                <span v-else class="w-1.5 h-1.5 rounded-full bg-ink-3" />
              </span>

              <div class="min-w-0 flex-1">
                <button class="flex flex-wrap items-center gap-1.5 text-left w-full" @click="toggleDetail(i.id)">
                  <component :is="openDetail.has(i.id) ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 text-ink-3 shrink-0" />
                  <span class="text-[11px] px-1.5 py-0.5 rounded-full border shrink-0" :class="kindClass(i.kind)">{{ kindLabel(i.kind) }}</span>
                  <span class="text-ds-sm text-ink font-medium">{{ i.title }}</span>
                  <span class="text-[11px]" :class="sevClass(i.severity)">{{ i.severity === 'high' ? '重要' : i.severity === 'medium' ? '一般' : '可选' }}</span>
                </button>
                <p class="mt-1 text-[12px] text-ink-3 break-all">
                  {{ i.noteTitle }} <span class="font-mono opacity-70">· {{ i.slug }}</span>
                </p>
                <p class="mt-1 text-[12px] text-ink-2">
                  <span class="text-ink-3">动作：</span>{{ actionLabel(i.action) }}
                </p>
                <p v-if="i.applied" class="mt-1 text-[12px] text-evergreen">已执行 {{ i.appliedAt }}</p>
                <p v-if="i.error" class="mt-1 text-[12px] text-danger">失败：{{ i.error }}</p>

                <div v-if="openDetail.has(i.id)" class="mt-2 rounded-ctl bg-surface border border-line p-2.5 space-y-2">
                  <p class="text-[12px] text-ink-2 whitespace-pre-wrap">{{ i.detail }}</p>
                  <div v-if="i.action?.type === 'append-section'" class="text-[12px] text-ink-2">
                    <p class="text-ink-3 mb-1">将追加：</p>
                    <pre class="whitespace-pre-wrap font-mono text-[11px] text-ink-2 bg-surface-2 rounded p-2 max-h-[220px] overflow-y-auto">{{ `## ${i.action.heading}\n\n${i.action.body}` }}</pre>
                  </div>
                  <p v-else-if="i.action?.type === 'add-tags'" class="text-[12px] text-ink-2">
                    将补标签：<span class="font-mono">{{ i.action.tags?.join('、') }}</span>
                  </p>
                  <p v-else-if="i.action?.type === 'set-domain'" class="text-[12px] text-ink-2">
                    将把领域改为：<span class="font-mono">{{ i.action.domain }}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
