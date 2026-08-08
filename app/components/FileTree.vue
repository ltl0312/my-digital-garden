<script setup lang="ts">
interface TreeNode {
  name: string
  type: 'dir' | 'file'
  slug?: string
  children?: TreeNode[]
}

defineProps<{
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
          class="flex items-center justify-between rounded px-1.5 py-1 hover:bg-[var(--card-bg)] cursor-pointer"
          @click="toggle(node.name)"
        >
          <span class="flex items-center gap-1">
            <span class="text-base font-bold text-[var(--text-primary)] leading-none">
              {{ expanded.has(node.name) ? '▾' : '▸' }}
            </span>
            <span>📁 {{ node.name }}</span>
          </span>
          <button
            v-if="canCreate"
            class="opacity-0 group-hover:opacity-100 text-xs text-[var(--accent-color)]"
            title="在此目录新建笔记"
            @click.stop="startCreate(node.name)"
          >＋</button>
        </div>
        <div v-if="creating === node.name" class="px-4 pb-1">
          <input
            v-model="newTitle"
            class="w-full px-1.5 py-0.5 rounded text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] outline-none"
            placeholder="新笔记标题"
            @keyup.enter="submitCreate(node.name)"
            @keyup.esc="creating = null"
          />
        </div>
        <FileTree v-if="expanded.has(node.name)" :nodes="node.children || []" :can-create="canCreate" class="pl-4" />
      </div>
      <NuxtLink
        v-else
        :to="`/notes/${node.slug}`"
        class="block rounded px-1.5 py-1 hover:bg-[var(--card-bg)] truncate"
        :class="{ 'text-[var(--accent-color)]': route.path === `/notes/${node.slug}` }"
      >
        📄 {{ node.name }}
      </NuxtLink>
    </li>
  </ul>
</template>
