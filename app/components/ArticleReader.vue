<script setup lang="ts">
import { Calendar, Clock, ListTree, Link2 } from 'lucide-vue-next'

const props = defineProps<{
  note: any
}>()

const scrollRef = ref<HTMLDivElement | null>(null)
const progress = ref(0)

// 阅读进度
onMounted(() => {
  const el = scrollRef.value
  if (!el) return
  const update = () => {
    const sh = el.scrollHeight - el.clientHeight
    progress.value = sh > 0 ? (el.scrollTop / sh) * 100 : 0
  }
  el.addEventListener('scroll', update)
  onScopeDispose(() => el.removeEventListener('scroll', update))
})

// TOC：从 htmlContent 提取 h2/h3
const toc = computed(() => {
  if (!props.note?.htmlContent) return []
  const items: { title: string; level: number }[] = []
  const regex = /<h([23])[^>]*>(.*?)<\/h\1>/g
  let m
  while ((m = regex.exec(props.note.htmlContent)) !== null) {
    const title = m[2].replace(/<[^>]+>/g, '').trim()
    if (title) items.push({ title, level: Number(m[1]) })
  }
  return items
})

const scrollToHeading = (title: string) => {
  const el = scrollRef.value
  if (!el) return
  const heading = Array.from(el.querySelectorAll('h2, h3')).find(h => h.textContent?.trim() === title)
  heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const readingMinutes = computed(() => {
  const len = props.note?.content?.length || 0
  return Math.max(1, Math.round(len / 400))
})

const category = computed(() => {
  const parts = (props.note?.slug || '').split('/')
  return parts.length > 1 ? parts[0] : 'Uncategorized'
})

const maturityLabel = computed(() => (props.note?.maturity || 'SEEDLING').toLowerCase())
const stageIcon = computed(() => maturityLabel.value === 'evergreen' ? '🌳' : maturityLabel.value === 'growing' ? '🌿' : '🌱')
const stageBadgeClass = computed(() => {
  switch (maturityLabel.value) {
    case 'seedling': return 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20'
    case 'growing': return 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/20'
    case 'evergreen': return 'bg-garden-500/10 text-garden-800 dark:text-garden-300 border-garden-500/20'
    default: return 'bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-white/10'
  }
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}
</script>

<template>
  <div ref="scrollRef" class="h-full overflow-y-auto relative scroll-smooth flex flex-col">
    <!-- 阅读进度条 -->
    <div class="sticky top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-white/5 z-20">
      <div
        class="h-full bg-gradient-to-r from-garden-500 to-emerald-500 dark:from-garden-400 dark:to-emerald-400 transition-all duration-150"
        :style="{ width: progress + '%' }"
      ></div>
    </div>

    <div class="max-w-3xl w-full mx-auto px-6 md:px-12 py-10 flex-1">
      <!-- 面包屑 -->
      <div class="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mb-6 font-mono">
        <NuxtLink to="/" class="hover:text-garden-600 dark:hover:text-garden-400 cursor-pointer">Garden Vault</NuxtLink>
        <span>/</span>
        <span class="text-garden-700 dark:text-garden-400 font-medium">{{ category }}</span>
      </div>

      <!-- 文章头 -->
      <div class="space-y-4 mb-8 border-b border-slate-200 dark:border-white/10 pb-8">
        <div class="flex flex-wrap items-center gap-2">
          <span :class="stageBadgeClass" class="px-3 py-1 rounded-full text-xs font-semibold border flex items-center space-x-1.5 shadow-sm">
            <span>{{ stageIcon }}</span>
            <span class="capitalize">{{ maturityLabel }}</span>
          </span>
          <span class="text-xs text-slate-600 dark:text-slate-400 flex items-center space-x-1 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full border border-slate-200 dark:border-white/5">
            <Calendar class="w-3 h-3 mr-1" />{{ formatDate(note.updatedAt) }}
          </span>
          <span class="text-xs text-slate-600 dark:text-slate-400 flex items-center space-x-1 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full border border-slate-200 dark:border-white/5">
            <Clock class="w-3 h-3 mr-1" />{{ readingMinutes }} min read
          </span>
        </div>
        <h1 class="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
          {{ note.title }}
        </h1>
        <div class="flex flex-wrap gap-1.5 pt-2">
          <NuxtLink
            v-for="tag in note.tags"
            :key="tag.tag.name"
            :to="`/notes?tag=${encodeURIComponent(tag.tag.name)}`"
            class="text-xs font-medium text-garden-800 dark:text-garden-300 bg-garden-500/10 hover:bg-garden-500/20 border border-garden-500/20 px-2.5 py-0.5 rounded-full cursor-pointer transition-colors"
          >
            #{{ tag.tag.name }}
          </NuxtLink>
        </div>
      </div>

      <!-- TOC -->
      <div v-if="toc.length" class="mb-8 p-4 rounded-2xl glass-card text-xs">
        <div class="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center space-x-1.5">
          <ListTree class="w-4 h-4 text-garden-600 dark:text-garden-400" /><span>Table of Contents</span>
        </div>
        <ul class="space-y-1.5 text-slate-600 dark:text-slate-400 pl-2">
          <li
            v-for="item in toc"
            :key="item.title"
            :class="{ 'pl-3': item.level === 2 }"
            class="hover:text-garden-700 dark:hover:text-garden-300 transition-colors cursor-pointer"
            @click="scrollToHeading(item.title)"
          >• {{ item.title }}</li>
        </ul>
      </div>

      <!-- 正文 -->
      <article
        class="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed space-y-6 text-base font-normal"
        v-html="note.htmlContent"
      ></article>

      <!-- Backlinks -->
      <div class="mt-16 pt-8 border-t border-slate-200 dark:border-white/10 space-y-4">
        <div class="flex items-center space-x-2">
          <Link2 class="w-4 h-4 text-garden-600 dark:text-garden-400" />
          <h3 class="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Backlinks & Related Concepts ({{ note.incoming?.length || 0 }})</h3>
        </div>
        <p v-if="!note.incoming?.length" class="text-xs text-slate-400 dark:text-slate-500 italic">No notes link directly to this document yet.</p>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NuxtLink
            v-for="link in note.incoming"
            :key="link.source.slug"
            :to="`/notes/${link.source.slug}`"
            class="p-3.5 rounded-xl glass-card hover:border-garden-500/50 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 group"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-garden-700 dark:group-hover:text-garden-300 transition-colors">{{ link.source.title }}</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 font-light">{{ link.source.summary || '暂无摘要' }}</p>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
