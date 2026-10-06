<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'
import type { TreeNodeLike } from '~/composables/useNameRule'

// RenameDialog（spec 6 / 8.8）：文件与文件夹重命名
// 与新建文件夹共用 useNameRule 的同名规则（同级不可重名），并把「自身」从同级里排除，
// 否则改成原名以外的任何名字都会被判成「已存在」。
//
// ── 文件名与「笔记标题」的关系（用户报障修复）──────────────────────────
// 报障原文：「重命名之后只是在列表中改了名……在笔记正文部分最上面的标题还是修改前的名称，
// 总之，选择的重命名就是简单地修改列表名称而已」。根因是重命名只改磁盘文件名 + DB.slug，
// 而显示名派生自 frontmatter（server/utils/markdown.ts 的 `frontmatter.title || basename(slug)`）。
//
// 现在的口径（用户确认过语义，服务端是权威，见 server/api/vault/rename.put.ts）：
//   ① 题名原本就是文件名 → 改文件名即改题名，直接连同正文首个标题一起改，不再多问一次；
//   ② 题名是人工写的（与文件名不同）→ 这里先问一句：勾选 = 连题名一起改，不勾 = 只改文件名。
//      「自定义题名」在导入笔记里很常见，不能用一次改名把它悄悄抹掉。
//   ③ 文件夹改名只改路径，不动其中任何笔记的题名。
const props = withDefaults(defineProps<{
  open: boolean
  /** 目标相对路径（vault 相对，不含 .md；文件夹则不含任何名称） */
  path?: string
  /** 目标类型：目录或文件 */
  isDir?: boolean
  /** 当前题名（结构树带下来的 DB 标题；目录或未知时为空串） */
  oldTitle?: string
  /** 同级节点（用于重名校验） */
  siblings?: TreeNodeLike[]
}>(), { path: '', isDir: true, oldTitle: '', siblings: () => [] })

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'renamed', r: { newPath: string; isDir: boolean; wasOpen: boolean }): void
}>()

const { nameProblem } = useNameRule()
const toast = useToast()
const requestFetch = useRequestFetch()

const name = ref('')
const submitting = ref(false)
/** 是否连笔记题名一起改（仅「人工题名」时会展示勾选框；默认勾选＝题名跟文件名走） */
const syncTitle = ref(true)

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
/** 用户正在输入的新文件名（还没输入时按原名，此时提交按钮是禁用的） */
const newName = computed(() => name.value.trim() || originalName.value)

/** 题名原本就跟着文件名走（或没有独立题名）→ 改名即改题名，无需询问 */
const titleMirrorsName = computed(() => !props.isDir && (!props.oldTitle || props.oldTitle === originalName.value))
/** 需要询问：笔记有人工题名（与**旧**文件名不同，即题名不是文件名的镜像），且这个题名与将要使用的新文件名也不同 */
const askSync = computed(() =>
  !props.isDir && !titleMirrorsName.value && !!props.oldTitle && props.oldTitle !== newName.value
)

watch(() => [props.open, props.path, props.oldTitle], () => {
  if (!props.open) return
  name.value = originalName.value
  // 只有「人工题名」这一支会展示勾选框；镜像笔记不弹框，走服务端默认口径 ①
  // （勾选值仍按题名是否跟文件名走来重置，避免上一次的勾选状态泄漏到下一篇笔记）
  syncTitle.value = titleMirrorsName.value
  submitting.value = false
})

const submit = async () => {
  const n = name.value.trim()
  if (!n || problem.value || n === originalName.value) return
  submitting.value = true
  // 重命名会把结构树里这个节点连同地址一起换掉；若它正是用户当前打开的笔记，
  // 提交后必须跟着走，否则页面停在一个已经不存在的地址上（跳转由 ContextSidebar 决定）。
  const wasOpen = decodeURIComponent(useRoute().path) === `/notes/${props.path.replace(/\.md$/i, '')}`
  try {
    const r = await requestFetch<{ slug?: string; path?: string; titleMismatch?: boolean }>('/api/vault/rename', {
      method: 'PUT',
      // 拿到题名时才表态；拿不到就交给服务端按「同不同名」自己判断（默认口径 ①）
      body: { path: props.path, name: n, ...(props.oldTitle ? { syncTitle: syncTitle.value } : {}) }
    })
    await refreshNuxtData('vault-tree')
    await refreshNuxtData('notes-recent')
    // 服务端判定「文件里的题名仍与新文件名不同」时如实说明，别让用户以为标题也跟着改了
    toast.success(r?.titleMismatch
      ? `已重命名为「${n}」，笔记标题保持原样`
      : `已重命名为「${n}」`)
    emit('renamed', { newPath: r?.slug || r?.path || n, isDir: props.isDir, wasOpen })
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

      <!-- 笔记题名与文件名不一致时，交由用户决定（口径 ②）：勾上就连题名一起改 -->
      <label v-if="askSync" data-testid="rename-sync-title" class="flex items-start gap-2 cursor-pointer select-none">
        <input v-model="syncTitle" type="checkbox" class="mt-0.5 accent-[var(--accent)]" />
        <span class="text-[12px] text-ink-2 leading-summary">
          同时把笔记标题改为「{{ newName }}」
          <span class="block text-ink-3">
            这篇笔记的标题是「{{ oldTitle }}」，与文件名不同；不勾选则只改文件名，标题保持原样。
          </span>
        </span>
      </label>
      <p v-else-if="titleMirrorsName" data-testid="rename-title-follows" class="text-[12px] text-ink-3">
        标题与文件名相同，重命名后笔记标题会一起更新。
      </p>

      <p class="text-[12px] text-ink-3 font-mono break-all leading-summary">落点预览：{{ preview }}</p>
      <p v-if="isDir" class="text-[12px] text-ink-3">
        重命名文件夹只改路径，其中笔记的标题保持不变。
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
