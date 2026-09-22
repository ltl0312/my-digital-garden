<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'
import type { TreeNodeLike } from '~/composables/useNameRule'

// RenameDialog（spec 6 / 8.8）：文件与文件夹重命名
// 与新建文件夹共用 useNameRule 的同名规则（同级不可重名），并把「自身」从同级里排除，
// 否则改成原名以外的任何名字都会被判成「已存在」。
const props = withDefaults(defineProps<{
  open: boolean
  /** 目标相对路径（vault 相对，不含 .md） */
  path?: string
  /** 目标类型：目录或文件 */
  isDir?: boolean
  /** 同级节点（用于重名校验） */
  siblings?: TreeNodeLike[]
}>(), { path: '', isDir: true, siblings: () => [] })

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'renamed', newPath: string): void
}>()

const { nameProblem } = useNameRule()
const toast = useToast()
const requestFetch = useRequestFetch()

const name = ref('')
const submitting = ref(false)

/** 同级里排除自身（按原名比对） */
const others = computed(() => {
  const selfName = props.path.split('/').pop() || ''
  return (props.siblings || []).filter(s => (s.name || '') !== selfName)
})

const problem = computed(() => {
  const n = name.value.trim()
  if (!n) return ''
  if (n === (props.path.split('/').pop() || '')) return ''
  return nameProblem(n, others.value)
})

const preview = computed(() => {
  const segs = props.path.split('/')
  const n = name.value.trim() || '（新名称）'
  const parentSegs = segs.slice(0, -1)
  const prefix = parentSegs.length ? `${parentSegs.join(' / ')} / ` : ''
  return `${prefix}${n}${props.isDir ? '' : '.md'}`
})

const originalName = computed(() => props.path.split('/').pop() || '')

watch(() => props.open, (v) => {
  if (!v) return
  name.value = originalName.value
  submitting.value = false
})

const submit = async () => {
  const n = name.value.trim()
  if (!n || problem.value || n === originalName.value) return
  submitting.value = true
  try {
    const r = await requestFetch<{ path: string }>('/api/vault/rename', {
      method: 'PUT',
      body: { path: props.path, name: n }
    })
    await refreshNuxtData('vault-tree')
    toast.success(`已重命名为「${n}」`)
    emit('renamed', (r as any)?.path || n)
    emit('update:open', false)
  } catch (e: any) {
    toast.error(e?.data?.message || '重命名失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="isDir ? '重命名文件夹' : '重命名笔记'"
    size="sm"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <div class="space-y-4">
      <label class="block">
        <span class="block text-[12px] text-ink-3 mb-1.5">新名称</span>
        <input
          v-model="name"
          class="w-full px-3 py-2 rounded-ctl bg-surface-2 border text-ds-sm text-ink placeholder-ink-3 focus:outline-none transition-colors duration-micro"
          :class="problem ? 'border-danger/60' : 'border-line focus:border-accent/60'"
          placeholder="输入新名称"
          @keyup.enter="submit"
        />
        <span v-if="problem" class="block mt-1.5 text-[12px] text-danger">{{ problem }}</span>
      </label>

      <p class="text-[12px] text-ink-3 font-mono break-all leading-summary">落点预览：{{ preview }}</p>
      <p v-if="isDir" class="text-[12px] text-ink-3">
        重命名文件夹会同步更新其中所有笔记的路径。
      </p>
    </div>

    <template #footer>
      <button
        class="px-3.5 py-2 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
        @click="emit('update:open', false)"
      >取消</button>
      <button
        class="px-3.5 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
        :disabled="!name.trim() || !!problem || name.trim() === originalName || submitting"
        @click="submit"
      >
        <Pencil class="w-4 h-4" />{{ submitting ? '提交中…' : '重命名' }}
      </button>
    </template>
  </AppDialog>
</template>
