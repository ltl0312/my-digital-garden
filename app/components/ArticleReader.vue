<script setup lang="ts">
// 笔记正文（spec 5.4）：完整路径面包屑 + 文章头 + 正文 + 上下篇 + 反链卡片
// 目录与进度条已迁至右侧 TocRail（E3）；本组件只负责正文列，自身不再滚动
import { Link2, Calendar, Clock, ArrowLeft, ArrowRight } from 'lucide-vue-next'
import { domainOfSlug } from '~/composables/useFacets'

const props = defineProps<{ note: any }>()

/**
 * 面包屑带目标地址：每一段目录都指到「该段累积路径」的目录筛选。
 *
 * 为什么不直接指 `/notes/<累积路径>`：笔记详情是 `/notes/[...slug]` catch-all，
 * 目录路径进去会被当成一篇笔记去查库，必然 404。目录筛选 `/notes?dir=` 才是目录的去处。
 * 末段（当前笔记）保持不可点 —— 点自己没有任何去处。
 */
const crumbs = computed(() => {
  const segs = String(props.note?.slug || '').split('/').filter(Boolean)
  const out: { label: string; to: string | null }[] = [{ label: 'Garden Vault', to: '/notes' }]
  segs.forEach((s, i) => {
    const last = i === segs.length - 1
    out.push({
      label: s,
      to: last ? null : `/notes?dir=${encodeURIComponent(segs.slice(0, i + 1).join('/'))}`
    })
  })
  return out
})

const dateText = computed(() => props.note?.updatedAt
  ? new Date(props.note.updatedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
  : '')

const mins = computed(() => props.note?.readingTime || Math.max(1, Math.round((props.note?.content?.length || 0) / 400)))

const domainOf = (slug: string) => domainOfSlug(slug).domain

// 正文若以「与标题同名」的 H1/H2 开头（Obsidian 等导出的笔记很常见，标题取自 frontmatter
// 而正文首行又写了一遍），会与上方文章头标题重复显示成两个一样的标题。
// v-html 直接注入 HTML，这里在渲染后把首部那个重复标题移除（内容不变，仅去掉视觉重复）。
//
// ⚠️ 只有当它**确实是重复**时才移除：若正文除这个标题外再无内容，移除就会把整篇笔记
// 渲染成空白 —— 新建笔记的模板正文恰好只有 `# <title>`（server/utils/vault.ts 的
// noteTemplate），实测新建后正文区全空，用户看到的是「一篇什么都没有的笔记」。
// 判据用去掉 H1 后的实际内容，而不是元素个数：`# 标题` + 空段落同样属于「只有标题」。
const articleEl = ref<HTMLElement | null>(null)

const dedupeLeadingTitle = () => {
  const el = articleEl.value
  const title = String(props.note?.title || '').trim()
  if (!el || !title) return
  const first = Array.from(el.children).find(c => /^H[12]$/.test(c.tagName) && (c.textContent || '').trim())
  if (!first || (first.textContent || '').trim() !== title) return
  const rest = Array.from(el.children).filter(c => c !== first)
  const hasRest = rest.some(c => (c.textContent || '').trim() || c.querySelector('img, video, audio, iframe, pre, table'))
  if (!hasRest) return
  first.remove()
}

onMounted(() => nextTick(dedupeLeadingTitle))
watch(
  () => [props.note?.slug, props.note?.htmlContent],
  () => nextTick(dedupeLeadingTitle)
)

// ── 上一篇 / 下一篇 ────────────────────────────────────────────
// 数据来自 `GET /api/notes/neighbors?slug=<slug>` → { prev, next }（各为 {slug,title} 或 null）。
//
// 为什么用 onMounted + $fetch 而不是 useAsyncData / await useFetch：
// 这是「锦上添花」的导航块，接口缺席或失败时正文必须照常可读。一旦把它做成阻塞取数，
// 一次 500 就能让整篇文章变成错误页 —— 代价与收益完全不匹配。失败一律退化成不显示。
type Neighbor = { slug: string; title: string } | null

const neighbors = ref<{ prev: Neighbor; next: Neighbor }>({ prev: null, next: null })
const neighborsReady = ref(false)

const noteHref = (slug: string) => `/notes/${slug.split('/').map(encodeURIComponent).join('/')}`

const loadNeighbors = async (slug: string) => {
  if (!slug || !import.meta.client) return
  neighborsReady.value = false
  try {
    const res = await $fetch<{ prev?: Neighbor; next?: Neighbor }>('/api/notes/neighbors', {
      query: { slug }
    })
    // 快速连点「下一篇」时会有多个请求在飞：只让「仍是当前这篇」的响应落地，
    // 否则先发后到的旧响应会盖掉新笔记的邻居。
    if (slug !== String(props.note?.slug || '')) return
    neighbors.value = { prev: res?.prev ?? null, next: res?.next ?? null }
  } catch {
    if (slug !== String(props.note?.slug || '')) return
    neighbors.value = { prev: null, next: null }
  } finally {
    if (slug === String(props.note?.slug || '')) neighborsReady.value = true
  }
}

onMounted(() => { void loadNeighbors(String(props.note?.slug || '')) })
watch(() => props.note?.slug, (s) => { void loadNeighbors(String(s || '')) })
</script>

<template>
  <div class="w-full">
    <!-- 完整路径面包屑（窄屏允许换行）：中间段可点 → 对应目录筛选，末段为当前笔记 -->
    <nav class="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-ds-xs text-ink-3 mb-5" aria-label="笔记路径">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i > 0" class="text-ink-3/50">/</span>
        <NuxtLink
          v-if="c.to"
          :to="c.to"
          class="hover:text-accent-text transition-colors duration-micro"
        >{{ c.label }}</NuxtLink>
        <span v-else :class="i === crumbs.length - 1 ? 'text-ink font-semibold' : ''">{{ c.label }}</span>
      </template>
    </nav>

    <!-- 文章头 -->
    <header class="pb-6 mb-8 border-b border-line">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <StatusBadge :maturity="note.maturity || 'SEEDLING'" />
        <span class="inline-flex items-center gap-1 text-ds-xs text-ink-3">
          <Calendar class="w-3 h-3" />{{ dateText }}
        </span>
        <span class="inline-flex items-center gap-1 text-ds-xs text-ink-3">
          <Clock class="w-3 h-3" />{{ mins }} 分钟
        </span>
      </div>

      <!-- 移动端字号降级：38px 长标题在 390px 宽下每行只能放 ~10 字，会把屏幕挤满（用户反馈的移动端文字挤压） -->
      <h1 class="text-[24px] sm:text-[32px] lg:text-[38px] leading-[1.25] font-extrabold tracking-tight text-ink mb-4 break-words">
        {{ note.title }}
      </h1>

      <div v-if="note.tags?.length" class="flex flex-wrap gap-1.5">
        <TagPill
          v-for="t in note.tags"
          :key="t.tag.name"
          :name="t.tag.name"
          :to="`/notes?tag=${encodeURIComponent(t.tag.name)}`"
        />
      </div>
    </header>

    <!-- 正文（TocRail 通过 [data-article-body] 观察标题） -->
    <article
      ref="articleEl"
      data-article-body
      class="prose dark:prose-invert max-w-none text-ink-2 leading-prose"
      v-html="note.htmlContent"
    ></article>

    <!-- 反链卡片：补上来源笔记的领域徽章与摘要（spec 5.4） -->
    <section class="mt-14 pt-6 border-t border-line">
      <h2 class="text-ds-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
        <Link2 class="w-3.5 h-3.5 text-accent-text" />反链与相关概念（{{ note.incoming?.length || 0 }}）
      </h2>
      <p v-if="!note.incoming?.length" class="text-ds-sm text-ink-3 italic">
        还没有笔记链接到这里 —— 在任意笔记里写 [[{{ note.title }}]] 即可建立双向链接。
      </p>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <NuxtLink
          v-for="link in note.incoming"
          :key="link.source.slug"
          :to="`/notes/${String(link.source.slug).split('/').map(encodeURIComponent).join('/')}`"
          class="p-3.5 rounded-card border border-line bg-surface hover:border-accent/40 hover:shadow-ds1 transition-all duration-base group"
        >
          <div class="flex items-start justify-between gap-2 mb-1.5">
            <span class="text-ds-sm font-semibold text-ink group-hover:text-accent-text transition-colors duration-micro leading-snug">
              {{ link.source.title }}
            </span>
            <DomainChip v-if="domainOf(link.source.slug)" :name="domainOf(link.source.slug)" size="sm" />
          </div>
          <p class="text-ds-xs text-ink-2 leading-summary line-clamp-2">
            {{ link.source.summary || domainOfSlug(link.source.slug).dirPath || '（暂无摘要）' }}
          </p>
        </NuxtLink>
      </div>
    </section>

    <!-- 上一篇 / 下一篇（接口拿到才显示；两栏网格，空的一侧用占位撑住，不让另一篇漂到中间） -->
    <nav
      v-if="neighborsReady && (neighbors.prev || neighbors.next)"
      class="mt-10 pt-6 border-t border-line"
      aria-label="上一篇 / 下一篇"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <NuxtLink
          v-if="neighbors.prev"
          :to="noteHref(neighbors.prev.slug)"
          class="flex flex-col gap-1 p-3.5 rounded-card border border-line bg-surface hover:border-accent/40 hover:shadow-ds1 transition-all duration-base group"
        >
          <span class="inline-flex items-center gap-1 text-ds-xs text-ink-3">
            <ArrowLeft class="w-3 h-3" />上一篇
          </span>
          <span class="text-ds-sm font-semibold text-ink group-hover:text-accent-text transition-colors duration-micro leading-snug line-clamp-2">
            {{ neighbors.prev.title }}
          </span>
        </NuxtLink>
        <!-- hidden sm:flex：窄屏两栏已堆叠，占位只会在「上一篇」和「下一篇」之间插一行空话 -->
        <div
          v-else
          class="hidden sm:flex items-center px-3.5 py-3 rounded-card border border-dashed border-line text-ds-xs text-ink-3"
        >
          已经是第一篇
        </div>

        <NuxtLink
          v-if="neighbors.next"
          :to="noteHref(neighbors.next.slug)"
          class="flex flex-col gap-1 p-3.5 rounded-card border border-line bg-surface hover:border-accent/40 hover:shadow-ds1 transition-all duration-base group sm:items-end sm:text-right"
        >
          <span class="inline-flex items-center gap-1 text-ds-xs text-ink-3">
            下一篇<ArrowRight class="w-3 h-3" />
          </span>
          <span class="text-ds-sm font-semibold text-ink group-hover:text-accent-text transition-colors duration-micro leading-snug line-clamp-2">
            {{ neighbors.next.title }}
          </span>
        </NuxtLink>
        <div
          v-else
          class="hidden sm:flex items-center justify-end px-3.5 py-3 rounded-card border border-dashed border-line text-ds-xs text-ink-3"
        >
          已经是最后一篇
        </div>
      </div>
    </nav>
  </div>
</template>
