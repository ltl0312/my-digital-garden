<script setup lang="ts">
// 详情页右侧目录栏（spec 5.4 / 6 TocRail）：目录 + 进度环 + 属性面板；≥1280 常驻 sticky
import { ListTree, Clock, Calendar, Link2 } from 'lucide-vue-next'
import { domainOfSlug } from '~/composables/useFacets'

const props = withDefaults(defineProps<{
  note: any
  /** 反链数（由页面传入，避免此处再依赖 note.incoming 结构） */
  backlinks?: number
  /** 'rail' = ≥1280 右侧常驻栏；'sheet' = 底部抽屉内（<1280，交付物第 04 屏） */
  variant?: 'rail' | 'sheet'
}>(), { variant: 'rail' })

// 目录：与 ArticleReader 渲染的标题按出现顺序一一对应（用索引对齐，避免文本匹配差异）
const toc = computed<{ title: string; level: number }[]>(() => {
  const html = props.note?.htmlContent
  if (!html) return []
  const out: { title: string; level: number }[] = []
  const re = /<h([23])[^>]*>(.*?)<\/h\1>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const title = (m[2] ?? '').replace(/<[^>]+>/g, '').trim()
    if (title) out.push({ title, level: Number(m[1]) })
  }
  return out
})

const activeIdx = ref(-1)
const progress = ref(0)

let io: IntersectionObserver | null = null
let scroller: HTMLElement | null = null

const bind = () => {
  const root = document.querySelector('[data-scroll-root]') as HTMLElement | null
  const heads = Array.from(document.querySelectorAll('[data-article-body] h2, [data-article-body] h3')) as HTMLElement[]
  if (!root || !heads.length) return
  scroller = root

  const onScroll = () => {
    const sh = root.scrollHeight - root.clientHeight
    progress.value = sh > 0 ? Math.min(100, Math.max(0, (root.scrollTop / sh) * 100)) : 0
  }
  root.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  io = new IntersectionObserver((entries) => {
    // 取最靠上的一条命中项作为当前项
    const visible = entries.filter(e => e.isIntersecting)
    const top = visible[0]
    if (!top) return
    const idx = heads.indexOf(top.target as HTMLElement)
    if (idx >= 0) activeIdx.value = idx
  }, { root, rootMargin: '-8% 0px -78% 0px', threshold: 0 })

  heads.forEach(h => io!.observe(h))

  onScopeDispose(() => {
    root.removeEventListener('scroll', onScroll)
    io?.disconnect()
    io = null
  })
}

onMounted(() => {
  // 等待 v-html 正文挂载
  nextTick(bind)
})
watch(() => props.note?.slug, () => {
  activeIdx.value = -1
  progress.value = 0
  io?.disconnect()
  io = null
  nextTick(bind)
})

const scrollTo = (i: number) => {
  const heads = document.querySelectorAll('[data-article-body] h2, [data-article-body] h3')
  heads[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const meta = computed(() => domainOfSlug(props.note?.slug))
const mins = computed(() => props.note?.readingTime || Math.max(1, Math.round((props.note?.content?.length || 0) / 400)))
const backCount = computed(() => props.backlinks ?? props.note?.incoming?.length ?? 0)
const dateText = computed(() => props.note?.updatedAt
  ? new Date(props.note.updatedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
  : '—')

// 进度环几何
const R = 15
const C = 2 * Math.PI * R
const dash = computed(() => `${(progress.value / 100) * C} ${C}`)
</script>

<template>
  <aside data-toc-rail class="space-y-4 text-ds-sm" :class="variant === 'rail' ? 'sticky top-6' : ''">
    <!-- 阅读进度环 -->
    <div class="rounded-card border border-line bg-surface p-3.5 flex items-center gap-3">
      <svg viewBox="0 0 36 36" class="w-9 h-9 -rotate-90 shrink-0" aria-hidden="true">
        <circle cx="18" cy="18" :r="R" fill="none" stroke="var(--line)" stroke-width="3" />
        <circle
          cx="18" cy="18" :r="R" fill="none" stroke="var(--accent)" stroke-width="3"
          stroke-linecap="round" :stroke-dasharray="dash"
          class="transition-[stroke-dasharray] duration-micro"
        />
      </svg>
      <div class="min-w-0">
        <p class="text-ds-sm font-semibold text-ink tabular-nums">{{ Math.round(progress) }}%</p>
        <p class="text-[12px] text-ink-3">已读</p>
      </div>
    </div>

    <!-- 目录 -->
    <nav v-if="toc.length" class="rounded-card border border-line bg-surface p-3.5" aria-label="文章目录">
      <p class="text-[12px] font-semibold text-ink-3 mb-2 flex items-center gap-1.5">
        <ListTree class="w-3.5 h-3.5" />目录
      </p>
      <ul class="space-y-0.5 max-h-[46vh] overflow-y-auto">
        <li v-for="(it, i) in toc" :key="i">
          <button
            class="w-full text-left py-1 leading-snug rounded-ctl transition-colors duration-micro border-l-2"
            :class="[
              it.level === 3 ? 'pl-5' : 'pl-2.5',
              i === activeIdx
                ? 'border-accent text-accent font-semibold bg-[var(--accent-soft)]'
                : 'border-transparent text-ink-2 hover:text-ink hover:bg-surface-3'
            ]"
            :aria-current="i === activeIdx ? 'location' : undefined"
            @click="scrollTo(i)"
          >{{ it.title }}</button>
        </li>
      </ul>
    </nav>

    <!-- 属性面板 -->
    <div class="rounded-card border border-line bg-surface p-3.5">
      <p class="text-[12px] font-semibold text-ink-3 mb-2.5">属性</p>
      <dl class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-[12px] text-ink-3">成熟度</dt>
          <dd><StatusBadge :maturity="note?.maturity || 'SEEDLING'" /></dd>
        </div>
        <div v-if="meta.domain" class="flex items-center justify-between gap-2">
          <dt class="text-[12px] text-ink-3">领域</dt>
          <dd><DomainChip :name="meta.domain" size="sm" /></dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-[12px] text-ink-3 flex items-center gap-1"><Clock class="w-3 h-3" />时长</dt>
          <dd class="text-[12px] text-ink-2 tabular-nums">{{ mins }} 分钟</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-[12px] text-ink-3 flex items-center gap-1"><Link2 class="w-3 h-3" />反链</dt>
          <dd class="text-[12px] text-ink-2 tabular-nums">{{ backCount }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-[12px] text-ink-3 flex items-center gap-1"><Calendar class="w-3 h-3" />更新</dt>
          <dd class="text-[12px] text-ink-2">{{ dateText }}</dd>
        </div>
      </dl>
      <p v-if="meta.dirPath" class="mt-3 pt-3 border-t border-line font-mono text-[12px] text-ink-3 break-all leading-summary">
        {{ meta.dirPath }}
      </p>
    </div>
  </aside>
</template>
