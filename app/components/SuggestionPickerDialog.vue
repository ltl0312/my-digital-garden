<script setup lang="ts">
// 笔记多选器（需求：能**指定哪些笔记**做标签 / 领域的自动化判定）
//
// 为什么需要它：在此之前「指定笔记」只有两个入口 —— 列表行的长按操作面板（单篇、不易发现）
// 与管理后台的「最近 / 整库」两个按钮。用户实际想要的是「我自己挑几篇来跑」。
//
// 设计要点：
//   · 选择**跨页/跨筛选保持**（key = slug）：否则筛一下、翻一页，前面选的就没法累计。
//   · 明确显示每篇「是否已有待审建议」：管理员显式发起的判定会**覆盖**已有待审
//     （服务端走 force=true），提交前必须让他知道会覆盖掉几篇，而不是静默替换。
//   · 领域筛选走**生效领域**（显式指定 ∪ 路径派生），与列表/图谱显示的口径一致 ——
//     只按目录筛会把「领域被显式改成 X 但文件在别处」的笔记漏掉。
//   · 默认筛「还没有待审建议」：这是管理员最常用的意图（补跑没判定过的）。
import { Search, Check, Sparkles, RefreshCw, X } from 'lucide-vue-next'

interface NoteRow {
  id: string
  slug: string
  title: string
  domain: string
  domainFrom: 'manual' | 'path' | 'fallback'
  hasPending?: boolean
  tags: Array<{ tag: { name: string } | null }>
}

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  /** 生成完成，回传本次处理的 slug（父级据此把审核面板收敛到这几篇） */
  (e: 'generated', slugs: string[]): void
}>()

const toast = useToast()
const { confirm } = useConfirm()
const { domains, tagGroups } = useFacets()
// 判定流程统一在 useSuggestionReview（分片提交 + 生成后打开审核面板并只看这几篇）
const { reviewForSlugs, generating } = useSuggestionReview()

const q = ref('')
const domainName = ref('')
const tag = ref('')
const pendingFilter = ref<'none' | 'any' | 'has'>('none')

const rows = ref<NoteRow[]>([])
const total = ref(0)
const totalPages = ref(1)
const page = ref(1)
const PAGE_SIZE = 20
const loading = ref(false)
// generating 来自 useSuggestionReview（跨组件共享，便于入口按钮统一显示 loading）

/** 选择跨页保持：slug → 该篇的展示信息（用于确认弹窗与提交） */
const selected = ref<Record<string, { title: string; hasPending: boolean }>>({})
const selectedCount = computed(() => Object.keys(selected.value).length)

// 「其他」不作为筛选目标：它不是可指派领域（服务端 isKnownDomain 明确拒绝兜底值），
// 且「既无显式领域、又不在任何知识区目录下」无法用一条 Prisma 条件表达。
const domainOptions = computed(() => [
  { value: '', label: '全部领域' },
  ...(domains.value as Array<{ name: string; count: number }>)
    .filter(d => d.name !== '其他')
    .map(d => ({ value: d.name, label: `${d.name}（${d.count}）` }))
])

const tagOptions = computed(() => [
  { value: '', label: '全部标签' },
  ...(tagGroups.value as Array<{ items: Array<{ name: string; count: number }> }>)
    .flatMap(g => g.items)
    .map(i => ({ value: i.name, label: `${i.name}（${i.count}）` }))
])

const dirOfDomain = (name: string) =>
  (domains.value as Array<{ name: string; dir: string }>).find(d => d.name === name)?.dir || ''

const load = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('pageSize', String(PAGE_SIZE))
    params.set('sort', 'updated')
    if (q.value.trim()) params.set('q', q.value.trim())
    if (tag.value) params.set('tag', tag.value)
    if (domainName.value) {
      params.set('domain', domainName.value)
      const d = dirOfDomain(domainName.value)
      if (d) params.set('dir', d)
    }
    if (pendingFilter.value !== 'any') params.set('pending', pendingFilter.value)

    const res = await $fetch<{ notes: NoteRow[]; total: number; totalPages: number }>(`/api/notes?${params.toString()}`)
    rows.value = res.notes || []
    total.value = res.total || 0
    totalPages.value = res.totalPages || 1
  } catch (e: any) {
    toast.error(e?.data?.message || '笔记列表加载失败')
  } finally {
    loading.value = false
  }
}

// 任一筛选变化 → 回到第 1 页重查（停在第 5 页再换筛选多半会看到空列表）
watch([domainName, tag, pendingFilter], () => { page.value = 1; void load() })
watch(page, () => void load())
watch(() => props.open, (v) => {
  if (!v) return
  page.value = 1
  void load()
})

// 搜索防抖：输入每个字符都打一次接口没必要
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(q, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; void load() }, 300)
})

const isSelected = (slug: string) => !!selected.value[slug]

const toggle = (row: NoteRow) => {
  const next = { ...selected.value }
  if (next[row.slug]) delete next[row.slug]
  else next[row.slug] = { title: row.title, hasPending: row.hasPending === true }
  selected.value = next
}

const allOnPageSelected = computed(() =>
  rows.value.length > 0 && rows.value.every(r => isSelected(r.slug))
)

const togglePage = () => {
  const next = { ...selected.value }
  if (allOnPageSelected.value) {
    for (const r of rows.value) delete next[r.slug]
  } else {
    for (const r of rows.value) next[r.slug] = { title: r.title, hasPending: r.hasPending === true }
  }
  selected.value = next
}

const clearAll = () => { selected.value = {} }

const generate = async () => {
  const slugs = Object.keys(selected.value)
  if (!slugs.length) { toast.warn('请先选择笔记'); return }

  const overwrite = slugs.filter(s => selected.value[s]?.hasPending)
  const ok = await confirm({
    title: `为 ${slugs.length} 篇笔记生成建议`,
    message: overwrite.length
      ? `其中 ${overwrite.length} 篇已有待审建议，将被**重新判定并覆盖**；其余为新增。生成后仍需你在审核面板逐条通过才会写入笔记。`
      : '将按当前标签库与正文判定，生成结果只是待审草稿；通过审核后才会写入笔记。',
    detail: overwrite.length ? overwrite.slice(0, 6).map(s => selected.value[s]?.title).join(' · ') : undefined,
    confirmText: '开始生成'
  })
  if (!ok) return

  // ⚠️ **先关面板，再判定**。
  // 判定可能要几十秒（选择量大时还会分片），若把「关闭」放在成功分支之后，
  // 一旦某片失败或被反代超时（生产 Nginx 未设 proxy_read_timeout，默认 60s），
  // 这个弹窗就会**卡住不关**，并挡住随后要打开的审核面板 —— 用户反馈的
  // 「点生成建议之后弹窗并不会消失，反而阻挡了新弹窗的生成」正是这个成因。
  emit('update:open', false)

  await reviewForSlugs(slugs)
  emit('generated', slugs)
}

const tagsOf = (row: NoteRow) =>
  row.tags.map(t => t.tag?.name).filter((n): n is string => !!n)
</script>

<template>
  <AppDialog
    :open="open"
    size="lg"
    title="选择笔记生成标签 · 领域建议"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <template #subtitle>
      <p class="mt-1 text-ds-sm text-ink-3">
        挑出要重新判定的笔记（可跨页多选）。生成的是<b>待审草稿</b>，通过审核后才会写入笔记。
      </p>
    </template>

    <!-- 筛选条 -->
    <div class="space-y-2.5 pb-3 border-b border-line">
      <div class="flex items-center gap-2">
        <div class="relative flex-1 min-w-0">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
          <input
            v-model="q"
            placeholder="搜索标题或正文…"
            class="w-full pl-8 pr-3 py-2 rounded-ctl bg-surface-2 border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
          />
        </div>
        <AppSelect v-model="domainName" size="sm" class="w-[150px] shrink-0" :options="domainOptions" />
        <AppSelect v-model="tag" size="sm" class="w-[170px] shrink-0" :options="tagOptions" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="inline-flex items-center rounded-ctl border border-line bg-surface-2 p-0.5" role="group" aria-label="待审筛选">
          <button
            v-for="o in [
              { v: 'none', l: '还没有待审' },
              { v: 'has', l: '已有待审' },
              { v: 'any', l: '全部' }
            ]"
            :key="o.v"
            class="px-2.5 h-7 rounded-[6px] text-[12px] transition-colors duration-micro"
            :class="pendingFilter === o.v ? 'bg-accent text-[var(--accent-ink)] font-semibold' : 'text-ink-2 hover:bg-surface-3'"
            :aria-pressed="pendingFilter === o.v"
            @click="pendingFilter = o.v as 'none' | 'has' | 'any'"
          >{{ o.l }}</button>
        </div>

        <span class="text-[12px] text-ink-3">共 {{ total }} 篇</span>

        <div class="flex-1"></div>

        <button
          class="px-2.5 py-1.5 rounded-ctl text-[12px] border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro disabled:opacity-45"
          :disabled="!rows.length"
          @click="togglePage"
        >{{ allOnPageSelected ? '取消本页' : '全选本页' }}</button>
        <button
          v-if="selectedCount"
          class="px-2.5 py-1.5 rounded-ctl text-[12px] text-ink-3 hover:bg-surface-3 hover:text-ink transition-colors duration-micro"
          @click="clearAll"
        >清空选择</button>
      </div>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="py-10 text-center text-ds-sm text-ink-3">正在加载…</div>
    <div v-else-if="!rows.length" class="py-10 text-center text-ds-sm text-ink-3">
      没有符合条件的笔记{{ pendingFilter === 'none' ? '（试试切到「全部」—— 可能都已判定过）' : '' }}
    </div>

    <ul v-else class="divide-y divide-[var(--line)]">
      <li v-for="row in rows" :key="row.id">
        <button
          class="w-full text-left flex items-start gap-3 py-2.5 px-1 rounded-ctl hover:bg-surface-2 transition-colors duration-micro"
          :aria-pressed="isSelected(row.slug)"
          @click="toggle(row)"
        >
          <span
            class="mt-0.5 w-4 h-4 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors duration-micro"
            :class="isSelected(row.slug) ? 'bg-accent border-accent' : 'border-line bg-surface'"
          >
            <Check v-if="isSelected(row.slug)" class="w-3 h-3 text-[var(--accent-ink)]" />
          </span>

          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2 flex-wrap">
              <span class="text-ds-sm text-ink font-medium truncate">{{ row.title }}</span>
              <span
                v-if="row.hasPending"
                class="shrink-0 px-1.5 py-0.5 rounded-pill text-[11px] border border-growing/40 text-growing"
              >已有待审</span>
              <span
                v-if="row.domainFrom === 'manual'"
                class="shrink-0 px-1.5 py-0.5 rounded-pill text-[11px] border border-accent/40 text-accent"
              >领域人工指定</span>
            </span>
            <span class="mt-0.5 block text-[12px] text-ink-3 font-mono truncate">{{ row.slug }}.md</span>
            <span class="mt-1 flex items-center gap-2 flex-wrap text-[12px] text-ink-3">
              <span>{{ row.domain }}</span>
              <span v-if="tagsOf(row).length">· {{ tagsOf(row).slice(0, 4).join('、') }}{{ tagsOf(row).length > 4 ? ' 等' : '' }}</span>
              <span v-else>· 无标签</span>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <div v-if="totalPages > 1" class="pt-4">
      <Pagination :page="page" :total-pages="totalPages" @change="(p: number) => page = p" />
    </div>

    <template #footer>
      <span class="flex-1 text-ds-sm text-ink-3 self-center">
        已选 <b class="text-ink">{{ selectedCount }}</b> 篇
      </span>
      <button
        class="px-4 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        @click="emit('update:open', false)"
      >取消</button>
      <button
        class="px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
        :disabled="generating || !selectedCount"
        @click="generate"
      >
        <RefreshCw v-if="generating" class="w-3.5 h-3.5 animate-spin" />
        <Sparkles v-else class="w-3.5 h-3.5" />
        生成建议（{{ selectedCount }}）
      </button>
    </template>
  </AppDialog>
</template>
