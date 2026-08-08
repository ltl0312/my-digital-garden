<template>
  <article class="max-w-3xl mx-auto px-4 py-8">
    <header class="mb-8 border-b border-[var(--border-color)] pb-6">
      <div class="flex items-center gap-3 text-xs text-[var(--text-secondary)] mb-2">
        <span class="px-2 py-0.5 rounded bg-[var(--card-bg)] uppercase font-semibold">
          {{ note.maturity }}
        </span>
        <time>{{ formatDate(note.updatedAt) }}</time>
      </div>
      <h1 class="text-3xl font-bold tracking-tight mb-4">{{ note.title }}</h1>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="tag in note.tags"
          :key="tag.tag.name"
          class="text-xs text-[var(--accent-color)] hover:underline cursor-pointer"
        >
          #{{ tag.tag.name }}
        </span>
      </div>
    </header>

    <div
      class="prose dark:prose-invert max-w-none leading-relaxed text-lg"
      v-html="note.htmlContent"
    ></div>

    <footer class="mt-16 pt-8 border-t border-[var(--border-color)]">
      <h3 class="text-lg font-semibold mb-4">反向链接 (Backlinks)</h3>
      <div v-if="note.incoming?.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NuxtLink
          v-for="link in note.incoming"
          :key="link.source.slug"
          :to="`/notes/${link.source.slug}`"
          class="p-4 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition"
        >
          <div class="font-medium text-sm mb-1">{{ link.source.title }}</div>
          <div class="text-xs text-[var(--text-secondary)] line-clamp-2">
            {{ link.source.summary || '暂无摘要' }}
          </div>
        </NuxtLink>
      </div>
      <p v-else class="text-sm text-[var(--text-secondary)]">暂无引用此笔记的页面</p>
    </footer>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  note: any
}>()

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>
