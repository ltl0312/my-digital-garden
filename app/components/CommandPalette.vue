<script setup lang="ts">
import { Search, FileText } from 'lucide-vue-next'

const open = defineModel<boolean>('open', { default: false })
const q = ref('')
const results = ref<any[]>([])
const loading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

watch(open, async (v) => {
  if (!v) {
    q.value = ''
    return
  }
  await nextTick()
  inputRef.value?.focus()
  await search()
})

const search = async () => {
  loading.value = true
  try {
    const requestFetch = useRequestFetch()
    const data = await requestFetch('/api/notes', { query: { q: q.value, pageSize: 8 } })
    results.value = data.notes || []
  } finally {
    loading.value = false
  }
}

const go = (slug: string) => {
  open.value = false
  navigateTo(`/notes/${slug.split('/').map(encodeURIComponent).join('/')}`)
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md flex items-start justify-center pt-20 px-4"
    @click.self="open = false"
  >
    <div class="w-full max-w-xl glass-card bg-white/90 dark:bg-obsidian-800/90 rounded-2xl border border-slate-200 dark:border-white/15 shadow-2xl overflow-hidden">
      <div class="p-4 border-b border-slate-200 dark:border-white/10 flex items-center space-x-3">
        <Search class="w-5 h-5 text-garden-600 dark:text-garden-400" />
        <input
          ref="inputRef"
          v-model="q"
          placeholder="Search notes, tags, ideas..."
          class="w-full bg-transparent text-base text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-medium"
          @input="search"
          @keyup.enter="results[0] && go(results[0].slug)"
        />
        <kbd class="text-xs text-slate-400 bg-slate-200/60 dark:bg-white/5 px-2 py-1 rounded cursor-pointer" @click="open = false">ESC</kbd>
      </div>
      <div class="max-h-80 overflow-y-auto p-2 space-y-1">
        <div
          v-for="n in results"
          :key="n.slug"
          class="p-3 rounded-xl hover:bg-garden-500/15 cursor-pointer flex items-center justify-between transition-colors group"
          @click="go(n.slug)"
        >
          <div class="flex items-center space-x-3">
            <FileText class="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-garden-600 dark:group-hover:text-garden-300" />
            <div>
              <div class="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white">{{ n.title }}</div>
              <div class="text-xs text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 line-clamp-1">{{ n.summary || n.slug }}</div>
            </div>
          </div>
          <span class="text-xs">{{ n.maturity === 'EVERGREEN' ? '🌳' : n.maturity === 'GROWING' ? '🌿' : '🌱' }}</span>
        </div>
        <div v-if="!results.length && !loading" class="p-8 text-center text-slate-400 text-sm">No matching garden notes found.</div>
      </div>
    </div>
  </div>
</template>
