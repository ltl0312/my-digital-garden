<script setup lang="ts">
const { data: list } = await useAsyncData('notes-index', () =>
  $fetch('/api/notes', { query: { pageSize: 8 } })
)

useHead({
  title: '拾光'
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-12">
    <section class="mb-10">
      <h1 class="text-4xl font-bold tracking-tight mb-3">✨ 拾光</h1>
      <p class="text-[var(--text-secondary)] leading-relaxed">
        我的个人知识花园——双向链接、自动图谱、护眼阅读。
      </p>
    </section>

    <section class="mb-6 flex items-center justify-between">
      <h2 class="text-lg font-semibold">最近更新</h2>
      <div class="flex items-center gap-4">
        <NuxtLink to="/notes" class="text-sm text-[var(--accent-color)] hover:underline transition">
          全部笔记 →
        </NuxtLink>
        <NuxtLink to="/graph" class="text-sm text-[var(--accent-color)] hover:underline transition">
          查看知识图谱 →
        </NuxtLink>
      </div>
    </section>

    <ul v-if="list?.notes?.length" class="space-y-3">
      <li v-for="note in list.notes" :key="note.slug">
        <NuxtLink
          :to="`/notes/${note.slug}`"
          class="block p-4 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition"
        >
          <div class="flex items-center gap-3 mb-1">
            <span class="px-2 py-0.5 rounded text-xs bg-[var(--bg-primary)] uppercase font-semibold">
              {{ note.maturity }}
            </span>
            <span class="text-xs text-[var(--text-secondary)]">{{ formatDate(note.updatedAt) }}</span>
          </div>
          <div class="font-medium mb-1">{{ note.title }}</div>
          <div class="text-xs text-[var(--text-secondary)] line-clamp-2">
            {{ note.summary || '暂无摘要' }}
          </div>
          <div class="flex flex-wrap gap-2 mt-2">
            <span v-for="t in note.tags" :key="t.tag.name" class="text-xs text-[var(--accent-color)]">
              #{{ t.tag.name }}
            </span>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="text-sm text-[var(--text-secondary)]">花园还是空的，向 content/vault 中添加笔记吧。</p>
  </div>
</template>
