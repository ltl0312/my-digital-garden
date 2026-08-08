<script setup lang="ts">
const requestFetch = useRequestFetch()
const { data: list } = await useAsyncData('notes-index', () =>
  requestFetch('/api/notes', { query: { pageSize: 8 } })
)

useHead({
  title: '拾光'
})

const maturityBadge = (m: string) => {
  switch (m) {
    case 'EVERGREEN': return 'bg-garden-500/10 text-garden-800 dark:text-garden-300 border-garden-500/20'
    case 'GROWING': return 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/20'
    default: return 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20'
  }
}
const maturityIcon = (m: string) => m === 'EVERGREEN' ? '🌳' : m === 'GROWING' ? '🌿' : '🌱'

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-12">
    <section class="mb-10">
      <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-3">
        ✨ 拾光
      </h1>
      <p class="text-slate-500 dark:text-slate-400 leading-relaxed font-light">
        Non-linear Knowledge Sanctuary — 双向链接、自动图谱、护眼阅读。
      </p>
    </section>

    <section class="mb-6 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white">最近更新</h2>
      <div class="flex items-center gap-4">
        <NuxtLink to="/notes" class="text-sm text-garden-700 dark:text-garden-400 hover:underline transition">
          全部笔记 →
        </NuxtLink>
        <NuxtLink to="/graph" class="text-sm text-garden-700 dark:text-garden-400 hover:underline transition">
          知识图谱 →
        </NuxtLink>
      </div>
    </section>

    <ul v-if="list?.notes?.length" class="space-y-3">
      <li v-for="note in list.notes" :key="note.slug">
        <NuxtLink
          :to="`/notes/${note.slug}`"
          class="block p-4 rounded-2xl glass-card hover:border-garden-500/50 transition-all duration-200 hover:-translate-y-0.5"
        >
          <div class="flex items-center gap-3 mb-1">
            <span :class="maturityBadge(note.maturity)" class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold border flex items-center space-x-1">
              <span>{{ maturityIcon(note.maturity) }}</span><span class="uppercase">{{ note.maturity }}</span>
            </span>
            <span class="text-xs text-slate-500 dark:text-slate-400">{{ formatDate(note.updatedAt) }}</span>
          </div>
          <div class="font-semibold text-slate-900 dark:text-white mb-1">{{ note.title }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 font-light">
            {{ note.summary || '暂无摘要' }}
          </div>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <span
              v-for="t in note.tags"
              :key="t.tag.name"
              class="text-[11px] font-medium text-garden-800 dark:text-garden-300 bg-garden-500/10 border border-garden-500/20 px-2 py-0.5 rounded-full"
            >#{{ t.tag.name }}</span>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="text-sm text-slate-400 dark:text-slate-500">花园还是空的，向 content/vault 中添加笔记吧。</p>
  </div>
</template>
