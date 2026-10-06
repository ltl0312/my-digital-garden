<script setup lang="ts">
// 标签 · 领域审核面板（需求：「自动化分配标签和领域，需要用户审核通过才行」）
//
// 设计要点（为什么长这样）：
//   · 建议只是**草稿**：标签与领域在这里都可改。审核者点「通过」才落库 + 写回 vault 文件，
//     所以每一条都必须能让审核者看清「为什么给我推这个」—— rationale 直接展示，不折叠。
//   · 低置信度排在最前（服务端已排序），并在卡片上标出：最需要人看的不该被埋在列表末尾。
//   · 领域有「保持当前 / 改为建议领域」两态，且永远显示「当前领域来自哪里」
//     （人工指定 / 目录派生）—— 审核者才知道自己是在覆盖一个决定，还是在纠正一个派生结果。
//   · 批量操作只作用于**当前勾选**的行，且通过前会弹确认并列出将改动的笔记数，
//     避免误点「全部通过」把几百篇的标签一次性改写。
import { X, Check, Sparkles, RefreshCw, ShieldQuestion, AlertTriangle, Plus } from 'lucide-vue-next'

interface SuggestRow {
  id: string
  slug: string
  title: string
  currentTags: string[]
  currentDomain: string
  domainFrom: 'manual' | 'path' | 'fallback'
  tags: string[]
  keepCurrentDir: boolean
  domain: string | null
  engine: string
  rationale: string[]
  confidence: number
  status: string
}

const props = defineProps<{
  open: boolean
  /**
   * 只看这些建议 id（空数组 = 全部待审）。
   * 用途：对「指定笔记」重新判定后，只展示刚生成的那一条，
   * 否则用户点一篇笔记却看到全库积压的几十条，无从判断。
   */
  onlyIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'applied'): void
}>()

const toast = useToast()
const { confirm } = useConfirm()
const { domains } = useFacets()

const rows = ref<SuggestRow[]>([])
const loading = ref(false)
const busy = ref(false)
const selected = ref<Set<string>>(new Set())

/** 每条建议的编辑态：最终标签 + 领域决定（keep = 保持当前领域） */
interface Draft { tags: string[]; domainMode: 'keep' | 'set'; domain: string }
const drafts = ref<Record<string, Draft>>({})
/** 逐行的手输标签输入框 */
const newTag = ref<Record<string, string>>({})

/** 只看指定 id 的那些条目（onlyIds 为空即不过滤） */
const focused = computed(() => {
  const ids = props.onlyIds || []
  if (!ids.length) return rows.value
  return rows.value.filter(r => ids.includes(r.id))
})

const domainOptions = computed(() => {
  const names = new Set<string>()
  for (const d of domains.value as Array<{ name: string }>) {
    if (d?.name && d.name !== '其他') names.add(d.name)
  }
  // 建议里出现过的领域也要能选（例如知识区暂未建目录但历史数据里已有该领域）
  for (const r of focused.value) if (r.domain) names.add(r.domain)
  return [...names].sort()
})

const load = async () => {
  loading.value = true
  try {
    const res = await $fetch<{ items: SuggestRow[]; pending: number }>('/api/admin/suggestions')
    rows.value = res.items
    const d: Record<string, Draft> = {}
    const t: Record<string, string> = {}
    for (const r of res.items) {
      d[r.id] = {
        tags: [...r.tags],
        domainMode: r.keepCurrentDir ? 'keep' : 'set',
        domain: r.domain || r.currentDomain
      }
      t[r.id] = ''
    }
    drafts.value = d
    newTag.value = t
    selected.value = new Set(res.items.map(r => r.id))
  } catch (e: any) {
    toast.error(e?.data?.message || '待审名单加载失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.open, (v) => { if (v) void load() })

const toggleSel = (id: string) => {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
// 全选/已选都以**当前可见的 focused** 为准：只看一条时「全选」不该选中看不见的其它条目
const allSelected = computed(() => focused.value.length > 0 && focused.value.every(r => selected.value.has(r.id)))
const toggleAll = () => {
  const ids = focused.value.map(r => r.id)
  const next = new Set(selected.value)
  if (allSelected.value) for (const id of ids) next.delete(id)
  else for (const id of ids) next.add(id)
  selected.value = next
}

const draftOf = (id: string): Draft => drafts.value[id] || { tags: [], domainMode: 'keep', domain: '' }

const toggleTag = (row: SuggestRow, name: string) => {
  const d = draftOf(row.id)
  const has = d.tags.includes(name)
  drafts.value = {
    ...drafts.value,
    [row.id]: { ...d, tags: has ? d.tags.filter(t => t !== name) : [...d.tags, name] }
  }
}

const removeTag = (row: SuggestRow, name: string) => {
  const d = draftOf(row.id)
  drafts.value = { ...drafts.value, [row.id]: { ...d, tags: d.tags.filter(t => t !== name) } }
}

const addTag = (row: SuggestRow) => {
  const raw = (newTag.value[row.id] || '').trim()
  if (!raw) return
  if (raw.length > 40) { toast.warn('单个标签不超过 40 个字符'); return }
  const d = draftOf(row.id)
  if (d.tags.includes(raw)) { toast.warn('该标签已在列表中'); return }
  drafts.value = { ...drafts.value, [row.id]: { ...d, tags: [...d.tags, raw] } }
  newTag.value = { ...newTag.value, [row.id]: '' }
}

/** 一条建议在界面上「改动了什么」——用于确认弹窗与逐条回执 */
const changeSummary = (row: SuggestRow): string => {
  const d = draftOf(row.id)
  const added = d.tags.filter(t => !row.currentTags.includes(t))
  const removed = row.currentTags.filter(t => !d.tags.includes(t))
  const parts: string[] = []
  if (added.length) parts.push(`+${added.length} 个标签`)
  if (removed.length) parts.push(`-${removed.length} 个标签`)
  if (d.domainMode === 'set' && d.domain && d.domain !== row.currentDomain) parts.push(`领域→${d.domain}`)
  return parts.length ? parts.join('、') : '无变化'
}

const submit = async (ids: string[], action: 'approve' | 'reject') => {
  if (!ids.length) { toast.warn('请先勾选要处理的条目'); return }

  if (action === 'approve') {
    const willChange = ids.filter((id) => {
      const row = rows.value.find(r => r.id === id)
      return row ? changeSummary(row) !== '无变化' : false
    })
    const ok = await confirm({
      title: `审核通过 ${ids.length} 条`,
      message: willChange.length
        ? `将写入 ${willChange.length} 篇笔记的 frontmatter（标签）与领域属性，vault 文件会被修改。`
        : '所选条目与现状一致，通过后仅记录审核结果，不改动笔记。',
      detail: willChange.length ? willChange.map(id => rows.value.find(r => r.id === id)?.title).filter(Boolean).join(' · ') : undefined,
      confirmText: '通过并写入',
      danger: false
    })
    if (!ok) return
  } else {
    const ok = await confirm({
      title: `驳回 ${ids.length} 条建议`,
      message: '驳回只记录审核结果，不会改动任何笔记。',
      confirmText: '驳回',
      danger: true
    })
    if (!ok) return
  }

  busy.value = true
  try {
    const items = ids.map((id) => {
      const row = rows.value.find(r => r.id === id)
      const d = draftOf(id)
      if (action === 'reject') return { id, action }
      return {
        id,
        action,
        tags: d.tags,
        // 'keep' 显式传 null：即使建议让改领域，也保持现状（这是审核者的明确决定）
        domain: d.domainMode === 'keep' ? null : d.domain
      }
    })
    const res = await $fetch<{ approved: number; rejected: number; failed: number; results: Array<{ ok: boolean; error?: string; slug?: string }> }>(
      '/api/admin/suggestions/review',
      { method: 'POST', body: { items } }
    )
    if (res.failed) {
      const first = res.results.find(r => !r.ok)
      toast.warn(`${res.approved} 条通过、${res.rejected} 条驳回，${res.failed} 条失败：${first?.error || '未知原因'}`)
    } else if (res.approved) {
      toast.success(`已通过 ${res.approved} 条，笔记标签与领域已更新`)
    } else {
      toast.success(`已驳回 ${res.rejected} 条，笔记未改动`)
    }
    emit('applied')
    await load()
  } catch (e: any) {
    toast.error(e?.data?.message || '审核提交失败')
  } finally {
    busy.value = false
  }
}

const checkedIds = computed(() => focused.value.filter(r => selected.value.has(r.id)).map(r => r.id))
const confClass = (c: number) =>
  c >= 70 ? 'text-evergreen' : c >= 40 ? 'text-growing' : 'text-danger'
const engineLabel = (e: string) => (e === 'rules+llm' ? '规则 + AI' : '规则')
const domainFromLabel = (f: string) =>
  f === 'manual' ? '人工指定' : f === 'path' ? '目录派生' : '未识别'
</script>

<template>
  <AppDialog
    :open="open"
    size="lg"
    :close-on-overlay="false"
    title="标签 · 领域审核"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <template #subtitle>
      <p class="mt-1 text-ds-sm text-ink-3">
        自动判定结果只是草稿；<strong class="text-ink-2">点「通过」才会写入笔记</strong>（标签写进文件 frontmatter，领域写进笔记属性）。
      </p>
    </template>

    <div v-if="loading" class="py-10 text-center text-ds-sm text-ink-3">正在读取待审名单…</div>

    <div v-else-if="!focused.length" class="py-10 text-center">
      <ShieldQuestion class="w-8 h-8 mx-auto mb-3 text-ink-3" />
      <p class="text-ds-sm text-ink-2">没有待审建议</p>
      <p class="mt-1 text-[12px] text-ink-3">
        在管理后台点「生成建议」，或直接导入笔记（导入完成后会自动排队生成）。
      </p>
    </div>

    <template v-else>
      <!-- 全选（只作用于当前可见条目） -->
      <div class="flex items-center justify-between gap-3 pb-3 mb-1 border-b border-line sticky top-0 bg-surface z-10">
        <button
          class="inline-flex items-center gap-2 text-ds-sm text-ink-2 hover:text-ink transition-colors duration-micro"
          @click="toggleAll"
        >
          <span
            class="w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors duration-micro"
            :class="allSelected ? 'bg-accent border-accent' : 'border-line bg-surface-2'"
          >
            <Check v-if="allSelected" class="w-3 h-3 text-[var(--accent-ink)]" />
          </span>
          全选（{{ focused.length }} 条 · 已选 {{ checkedIds.length }}）
        </button>
        <span class="text-[12px] text-ink-3">按置信度从低到高排列</span>
      </div>

      <ul class="space-y-3 pb-2">
        <li
          v-for="row in focused"
          :key="row.id"
          class="rounded-card border p-4 transition-colors duration-micro"
          :class="selected.has(row.id) ? 'border-accent/45 bg-[var(--accent-soft)]' : 'border-line bg-surface-2'"
        >
          <!-- 头部：勾选 + 标题 + 置信度 -->
          <div class="flex items-start gap-3">
            <button
              class="mt-0.5 w-4 h-4 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors duration-micro"
              :class="selected.has(row.id) ? 'bg-accent border-accent' : 'border-line bg-surface'"
              :aria-pressed="selected.has(row.id)"
              :aria-label="`选择 ${row.title}`"
              @click="toggleSel(row.id)"
            >
              <Check v-if="selected.has(row.id)" class="w-3 h-3 text-[var(--accent-ink)]" />
            </button>

            <div class="min-w-0 flex-1">
              <p class="text-ds-sm font-semibold text-ink truncate">{{ row.title }}</p>
              <p class="mt-0.5 text-[12px] text-ink-3 font-mono truncate">{{ row.slug }}.md</p>
            </div>

            <div class="shrink-0 text-right">
              <span class="text-[12px] font-semibold" :class="confClass(row.confidence)">{{ row.confidence }}%</span>
              <p class="text-[11px] text-ink-3">{{ engineLabel(row.engine) }}</p>
            </div>
          </div>

          <!-- 低置信度提醒 -->
          <p v-if="row.confidence < 40" class="mt-2 flex items-start gap-1.5 text-[12px] text-ink-3">
            <AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5 text-growing" />
            置信度较低，建议逐项确认后再通过。
          </p>

          <!-- 现有标签 -->
          <div v-if="row.currentTags.length" class="mt-3">
            <p class="text-[12px] text-ink-3 mb-1.5">现有标签（取消勾选即从笔记中移除）</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="t in row.currentTags"
                :key="`cur-${t}`"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[12px] transition-colors duration-micro"
                :class="draftOf(row.id).tags.includes(t)
                  ? 'border-line bg-surface text-ink-2'
                  : 'border-danger/40 bg-transparent text-danger line-through'"
                :title="draftOf(row.id).tags.includes(t) ? '点击移除该标签' : '点击恢复该标签'"
                @click="toggleTag(row, t)"
              >
                {{ t }}
                <X v-if="draftOf(row.id).tags.includes(t)" class="w-3 h-3" />
                <Plus v-else class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- 建议标签 -->
          <div class="mt-3">
            <p class="text-[12px] text-ink-3 mb-1.5 flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5 text-accent" />建议新增标签
              <span v-if="!row.tags.length" class="text-ink-3">（无——现有标签已覆盖，或标签库匹配不到候选）</span>
            </p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="t in row.tags"
                :key="`new-${t}`"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[12px] transition-colors duration-micro"
                :class="draftOf(row.id).tags.includes(t)
                  ? 'border-accent/50 bg-surface text-ink font-medium'
                  : 'border-line bg-surface text-ink-3'"
                :title="draftOf(row.id).tags.includes(t) ? '点击取消采纳' : '点击采纳该标签'"
                @click="toggleTag(row, t)"
              >
                <Check v-if="draftOf(row.id).tags.includes(t)" class="w-3 h-3 text-accent" />
                <Plus v-else class="w-3 h-3" />
                {{ t }}
              </button>
            </div>

            <!-- 手输新标签：自动化只从既有标签里选，需要新词时由人加 -->
            <div class="mt-2 flex items-center gap-2">
              <input
                v-model="newTag[row.id]"
                placeholder="手动添加标签（自动判定不会发明新标签）"
                class="flex-1 min-w-0 px-2.5 py-1.5 rounded-ctl bg-surface border border-line text-[12px] text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
                @keyup.enter="addTag(row)"
              />
              <button
                class="shrink-0 px-2.5 py-1.5 rounded-ctl border border-line bg-surface text-[12px] text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
                @click="addTag(row)"
              >添加</button>
            </div>

            <!-- 最终结果预览 -->
            <p v-if="draftOf(row.id).tags.length" class="mt-2 text-[12px] text-ink-3">
              通过后标签为：<span class="text-ink-2">{{ draftOf(row.id).tags.join('、') }}</span>
            </p>
            <p v-else class="mt-2 text-[12px] text-ink-3">通过后该笔记<b>没有标签</b>（frontmatter 的 tags 会被移除）。</p>
          </div>

          <!-- 领域 -->
          <div class="mt-3 pt-3 border-t border-line">
            <p class="text-[12px] text-ink-3 mb-1.5">
              领域 · 当前为「{{ row.currentDomain }}」
              <span class="text-ink-3">（{{ domainFromLabel(row.domainFrom) }}）</span>
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex items-center rounded-ctl border border-line bg-surface p-0.5" role="group">
                <button
                  class="px-2.5 h-7 rounded-[6px] text-[12px] transition-colors duration-micro"
                  :class="draftOf(row.id).domainMode === 'keep' ? 'bg-accent text-[var(--accent-ink)] font-semibold' : 'text-ink-2 hover:bg-surface-3'"
                  @click="drafts = { ...drafts, [row.id]: { ...draftOf(row.id), domainMode: 'keep' } }"
                >保持当前</button>
                <button
                  class="px-2.5 h-7 rounded-[6px] text-[12px] transition-colors duration-micro"
                  :class="draftOf(row.id).domainMode === 'set' ? 'bg-accent text-[var(--accent-ink)] font-semibold' : 'text-ink-2 hover:bg-surface-3'"
                  :disabled="!domainOptions.length"
                  @click="drafts = { ...drafts, [row.id]: { ...draftOf(row.id), domainMode: 'set' } }"
                >改为</button>
              </div>

              <AppSelect
                v-if="draftOf(row.id).domainMode === 'set'"
                :model-value="draftOf(row.id).domain"
                size="sm"
                :options="domainOptions.map(d => ({ value: d, label: d }))"
                @update:model-value="(v: string) => drafts = { ...drafts, [row.id]: { ...draftOf(row.id), domain: v } }"
              />
              <span v-else-if="row.domain && !row.keepCurrentDir" class="text-[12px] text-ink-3">
                自动化曾建议改为「{{ row.domain }}」（已选择保持当前）
              </span>
            </div>
          </div>

          <!-- 判定依据：必须能看见，否则审核就是盲签 -->
          <ul v-if="row.rationale.length" class="mt-3 space-y-1">
            <li v-for="(why, i) in row.rationale" :key="i" class="text-[12px] text-ink-3 flex items-start gap-1.5">
              <span class="mt-1.5 w-1 h-1 rounded-full bg-[var(--line)] shrink-0"></span>{{ why }}
            </li>
          </ul>

          <!-- 逐条操作 -->
          <div class="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2">
            <span class="text-[12px] text-ink-3">将改动：{{ changeSummary(row) }}</span>
            <div class="flex items-center gap-2">
              <button
                class="px-2.5 py-1.5 rounded-ctl text-[12px] text-ink-3 hover:bg-surface-3 hover:text-ink transition-colors duration-micro disabled:opacity-45"
                :disabled="busy"
                @click="submit([row.id], 'reject')"
              >驳回</button>
              <button
                class="px-3 py-1.5 rounded-ctl text-[12px] font-semibold bg-accent text-[var(--accent-ink)] transition-opacity duration-micro disabled:opacity-45"
                :disabled="busy"
                @click="submit([row.id], 'approve')"
              >通过</button>
            </div>
          </div>
        </li>
      </ul>
    </template>

    <template #footer>
      <button
        class="px-4 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        @click="emit('update:open', false)"
      >关闭</button>
      <button
        class="px-4 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5 disabled:opacity-45"
        :disabled="busy || !checkedIds.length"
        @click="submit(checkedIds, 'reject')"
      >驳回所选（{{ checkedIds.length }}）</button>
      <button
        class="px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
        :disabled="busy || !checkedIds.length"
        @click="submit(checkedIds, 'approve')"
      >
        <RefreshCw v-if="busy" class="w-3.5 h-3.5 animate-spin" />
        <Check v-else class="w-3.5 h-3.5" />
        通过所选（{{ checkedIds.length }}）
      </button>
    </template>
  </AppDialog>
</template>
