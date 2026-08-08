<script setup lang="ts">
const route = useRoute()
const { isAdmin } = useAuth()

// catch-all 路由下 params.slug 为数组，join 还原多级 slug
const slug = computed(() => {
  const s = Array.isArray(route.params.slug) ? route.params.slug.join('/') : route.params.slug
  return s
})

// 逐段编码（保留 / 为路径分隔符；整体 encodeURIComponent 会生成 %2F 导致路由失配 404）
const encodedSlug = computed(() => slug.value.split('/').map(encodeURIComponent).join('/'))

const requestFetch = useRequestFetch()
const note = ref<any>(null)
const error = ref<any>(null)

const loadNote = async () => {
  try {
    note.value = await requestFetch(`/api/notes/${encodedSlug.value}`)
    error.value = null
  } catch (e: any) {
    error.value = e
  }
}

// SSR 初始数据
await loadNote()

// 侧边栏跳转另一篇笔记时（组件实例复用），slug 变化立即重取（手动模式，不依赖 useAsyncData 语义）
watch(slug, () => loadNote())

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode || 500,
    message: error.value.message || '笔记加载失败'
  })
}

const editing = ref(false)
const draft = ref('')
const saving = ref(false)

const startEdit = () => {
  draft.value = note.value?.content || ''
  editing.value = true
}

const cancelEdit = () => {
  editing.value = false
}

const saveNote = async () => {
  saving.value = true
  try {
    await $fetch(`/api/vault/notes/${encodedSlug.value}`, { method: 'PUT', body: { content: draft.value } })
    editing.value = false
    // 等待 watcher 串行队列同步入库后刷新
    await new Promise(r => setTimeout(r, 1500))
    await loadNote()
  } catch (e: any) {
    alert(e?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const removeNote = async () => {
  if (!confirm(`确定删除「${note.value?.title}」？此操作不可恢复。`)) return
  await $fetch(`/api/vault/notes/${encodedSlug.value}`, { method: 'DELETE' })
  await navigateTo('/')
}

useHead({
  title: note.value?.title ? `${note.value.title} · 拾光` : '拾光'
})
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8">
    <div v-if="isAdmin" class="flex justify-end gap-3 mb-4">
      <template v-if="!editing">
        <button
          class="px-3 py-1.5 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition"
          @click="startEdit"
        >✏️ 编辑</button>
      </template>
      <template v-else>
        <button
          class="px-3 py-1.5 rounded-lg text-sm border border-[var(--border-color)] text-[var(--text-secondary)]"
          :disabled="saving"
          @click="cancelEdit"
        >取消</button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm bg-[var(--accent-color)] text-white disabled:opacity-50"
          :disabled="saving"
          @click="saveNote"
        >{{ saving ? '保存中…' : '💾 保存' }}</button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm text-red-400 border border-red-300/30 hover:bg-red-50 dark:hover:bg-red-950/30"
          @click="removeNote"
        >🗑 删除</button>
      </template>
    </div>

    <ArticleReader v-if="note && !editing" :note="note" />
    <textarea
      v-else-if="editing"
      v-model="draft"
      class="w-full h-[70vh] p-4 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] font-mono text-sm leading-relaxed focus:border-[var(--accent-color)] outline-none resize-y"
      spellcheck="false"
    ></textarea>
  </div>
</template>
