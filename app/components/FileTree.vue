<script setup lang="ts">
import { Folder, FolderOpen } from 'lucide-vue-next'

interface TreeNode {
  name: string
  type: 'dir' | 'file'
  slug?: string
  children?: TreeNode[]
}

const props = defineProps<{
  nodes: TreeNode[]
  canCreate?: boolean
}>()

const route = useRoute()
const expanded = ref<Set<string>>(new Set())
const creating = ref<string | null>(null) // 当前正在新建笔记的目录
const newTitle = ref('')

const toggle = (name: string) => {
  const next = new Set(expanded.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }
  expanded.value = next
}

const countFiles = (children?: TreeNode[]): number => {
  if (!children) return 0
  return children.reduce((acc, c) => acc + (c.type === 'file' ? 1 : countFiles(c.children)), 0)
}

const startCreate = (dir: string) => {
  creating.value = dir
  newTitle.value = ''
}

const submitCreate = async (dir: string) => {
  const title = newTitle.value.trim()
  if (!title) return
  try {
    const { slug } = await $fetch('/api/vault/notes', { method: 'POST', body: { path: dir, title } })
    creating.value = null
    await navigateTo(`/notes/${slug.split('/').map(encodeURIComponent).join('/')}`)
  } catch (e: any) {
    alert(e?.data?.message || '创建失败')
  }
}
</script>

<template>
  <ul class="text-sm space-y-0.5">
    <li v-for="node in nodes" :key="node.name">
      <div v-if="node.type === 'dir'" class="group">
        <div
          class="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5 cursor-pointer select-none transition-colors"
          @click="toggle(node.name)"
        >
          <div class="flex items-center space-x-2">
            <FolderOpen v-if="expanded.has(node.name)" class="w-3.5 h-3.5 text-garden-600 dark:text-garden-400 group-hover:scale-110 transition-transform" />
            <Folder v-else class="w-3.5 h-3.5 text-garden-600 dark:text-garden-400 group-hover:scale-110 transition-transform" />
            <span>{{ node.name }}</span>
          </div>
          <span class="text-[10px] bg-slate-200 dark:bg-white/5 px-2 py-0.5 rounded-full text-slate-500 dark:text-slate-400 font-mono">{{ countFiles(node.children) }}</span>
        </div>
        <div v-if="creating === node.name" class="px-4 pb-1">
          <input
            v-model="newTitle"
            class="w-full px-1.5 py-0.5 rounded text-xs bg-slate-100 dark:bg-obsidian-900 border border-slate-200 dark:border-white/10 outline-none"
            placeholder="新笔记标题"
            @keyup.enter="submitCreate(node.name)"
            @keyup.esc="creating = null"
          />
        </div>
        <div class="pl-4 space-y-0.5 border-l border-slate-200 dark:border-white/5 ml-4 my-1">
          <FileTree v-if="expanded.has(node.name)" :nodes="node.children || []" :can-create="canCreate" />
        </div>
      </div>
      <NuxtLink
        v-else
        :to="`/notes/${node.slug}`"
        class="py-2 pr-2 rounded-r-lg text-xs cursor-pointer transition-all duration-150 flex items-center justify-between group"
        :class="route.path === `/notes/${node.slug}`
          ? 'bg-garden-500/15 text-garden-800 dark:text-garden-300 border-l-2 border-garden-500 font-semibold pl-3'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5 pl-2.5'"
      >
        <span class="truncate">{{ node.name }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>
