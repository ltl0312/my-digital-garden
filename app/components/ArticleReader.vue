<script setup lang="ts">
// 笔记正文（spec 5.4）：完整路径面包屑 + 文章头 + 正文 + 反链卡片
// 目录与进度条已迁至右侧 TocRail（E3）；本组件只负责正文列，自身不再滚动
import { Link2, Calendar, Clock } from 'lucide-vue-next'
import { domainOfSlug } from '~/composables/useFacets'

const props = defineProps<{ note: any }>()

const crumbs = computed(() => {
  const segs = String(props.note?.slug || '').split('/').filter(Boolean)
  return ['Garden Vault', ...segs]
})

const dateText = computed(() => props.note?.updatedAt
  ? new Date(props.note.updatedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
  : '')

const mins = computed(() => props.note?.readingTime || Math.max(1, Math.round((props.note?.content?.length || 0) / 400)))

const domainOf = (slug: string) => domainOfSlug(slug).domain

// 正文若以「与标题同名」的 H1/H2 开头（Obsidian 等导出的笔记很常见，标题取自 frontmatter
// 而正文首行又写了一遍），会与上方文章头标题重复显示成两个一样的标题。
// v-html 直接注入 HTML，这里在渲染后把首部那个重复标题移除（内容不变，仅去掉视觉重复）。
const articleEl = ref<HTMLElement | null>(null)

const dedupeLeadingTitle = () => {
  const el = articleEl.value
  const title = String(props.note?.title || '').trim()
  if (!el || !title) return
  const first = Array.from(el.children).find(c => /^H[12]$/.test(c.tagName) && (c.textContent || '').trim())
  if (first && (first.textContent || '').trim() === title) first.remove()
}

onMounted(() => nextTick(dedupeLeadingTitle))
watch(
  () => [props.note?.slug, props.note?.htmlContent],
  () => nextTick(dedupeLeadingTitle)
)
</script>

<template>
  <div class="w-full">
    <!-- 完整路径面包屑（窄屏允许换行） -->
    <nav class="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[12px] text-ink-3 mb-5" aria-label="笔记路径">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i > 0" class="text-ink-3/50">/</span>
        <NuxtLink v-if="i === 0" to="/notes" class="hover:text-accent transition-colors duration-micro">{{ c }}</NuxtLink>
        <span v-else :class="i === crumbs.length - 1 ? 'text-ink font-semibold' : ''">{{ c }}</span>
      </template>
    </nav>

    <!-- 文章头 -->
    <header class="pb-6 mb-8 border-b border-line">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <StatusBadge :maturity="note.maturity || 'SEEDLING'" />
        <span class="inline-flex items-center gap-1 text-[12px] text-ink-3">
          <Calendar class="w-3 h-3" />{{ dateText }}
        </span>
        <span class="inline-flex items-center gap-1 text-[12px] text-ink-3">
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
      class="prose dark:prose-invert max-w-none text-ink-2 text-[16px] leading-prose"
      v-html="note.htmlContent"
    ></article>

    <!-- 反链卡片：补上来源笔记的领域徽章与摘要（spec 5.4） -->
    <section class="mt-14 pt-6 border-t border-line">
      <h2 class="text-ds-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
        <Link2 class="w-3.5 h-3.5 text-accent" />反链与相关概念（{{ note.incoming?.length || 0 }}）
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
            <span class="text-ds-sm font-semibold text-ink group-hover:text-accent transition-colors duration-micro leading-snug">
              {{ link.source.title }}
            </span>
            <DomainChip v-if="domainOf(link.source.slug)" :name="domainOf(link.source.slug)" size="sm" />
          </div>
          <p class="text-[12px] text-ink-2 leading-summary line-clamp-2">
            {{ link.source.summary || domainOfSlug(link.source.slug).dirPath || '（暂无摘要）' }}
          </p>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
