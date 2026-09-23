<script setup lang="ts">
// 新建文件夹对话框（spec 6 NewFolderDialog / 8.6）：
// 父目录（含 vault 根）+ 名称 + 实时路径预览 + 行内校验；与「重名」规则共用 useNameRule
import { FolderPlus } from 'lucide-vue-next'
import type { TreeNodeLike } from '~/composables/useNameRule'

const props = withDefaults(defineProps<{
  open: boolean
  tree?: TreeNodeLike[]
  defaultParent?: string
}>(), { tree: () => [], defaultParent: '' })

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', parent: string): void
}>()

const { nameProblem, findDirNode, collectDirPaths } = useNameRule()
const toast = useToast()
const requestFetch = useRequestFetch()

const name = ref('')
const parent = ref('')
const submitting = ref(false)

const parentOptions = computed(() => {
  const dirs = [...collectDirPaths(props.tree)].sort()
  return [{ value: '', label: 'vault 顶层' }, ...dirs.map(d => ({ value: d, label: d }))]
})

watch(() => props.open, (v) => {
  if (!v) return
  name.value = ''
  parent.value = props.defaultParent || ''
  submitting.value = false
})

const problem = computed(() => {
  if (!name.value.trim()) return ''
  const siblings = findDirNode(props.tree, parent.value)?.children || []
  return nameProblem(name.value.trim(), siblings)
})

const preview = computed(() => {
  const n = name.value.trim() || '（文件夹名）'
  // 防御：上游若把非字符串（如 MouseEvent）塞进 default-parent，这里 split 会抛错并让整个
  // 对话框渲染崩溃（表现为「点了没反应」，且状态卡住后所有入口都失效）
  const p = typeof parent.value === 'string' ? parent.value : ''
  return p ? `Garden Vault / ${p.split('/').join(' / ')} / ${n}` : `Garden Vault / ${n}`
})

const submit = async () => {
  const n = name.value.trim()
  if (!n) return
  if (problem.value) return
  submitting.value = true
  try {
    await requestFetch('/api/vault/folders', { method: 'POST', body: { parent: parent.value, name: n } })
    await refreshNuxtData('vault-tree')
    toast.success(`已创建文件夹「${n}」`)
    emit('created', parent.value)
    emit('update:open', false)
  } catch (e: any) {
    toast.error(e?.data?.message || '创建失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="新建文件夹"
    size="sm"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <div class="space-y-4">
      <label class="block">
        <span class="block text-[12px] text-ink-3 mb-1.5">父目录</span>
        <AppSelect v-model="parent" :options="parentOptions" />
      </label>

      <label class="block">
        <span class="block text-[12px] text-ink-3 mb-1.5">文件夹名</span>
        <input
          v-model="name"
          placeholder="如：设计模式"
          class="w-full px-3 py-2 rounded-ctl bg-surface-2 border text-ds-sm text-ink placeholder-ink-3 focus:outline-none transition-colors duration-micro"
          :class="problem ? 'border-danger/60' : 'border-line focus:border-accent/60'"
          @keyup.enter="submit"
        />
        <span v-if="problem" class="block mt-1.5 text-[12px] text-danger">{{ problem }}</span>
      </label>

      <p class="text-[12px] text-ink-3 font-mono break-all leading-summary">落点预览：{{ preview }}</p>
    </div>

    <template #footer>
      <button
        class="px-3.5 py-2 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        @click="emit('update:open', false)"
      >取消</button>
      <button
        class="px-3.5 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
        :disabled="!name.trim() || !!problem || submitting"
        @click="submit"
      >
        <FolderPlus class="w-4 h-4" />{{ submitting ? '创建中…' : '创建文件夹' }}
      </button>
    </template>
  </AppDialog>
</template>
