<script setup lang="ts">
import { Pencil, MoreHorizontal, Link2, FolderTree, FileText, Trash2, Save, X, Info } from 'lucide-vue-next'

const route = useRoute()
const { canManage } = useRoles()
const toast = useToast()
const { confirm } = useConfirm()

// 「在结构树中定位」所需的跨组件状态（spec 5.4）
const sidebarOpen = useState<boolean>('shell-sidebar-open', () => true)
const sidebarPanel = useState<'tree' | 'domain' | 'tag'>('shell-sidebar-panel', () => 'tree')
const revealSlug = useState<string>('shell-reveal-slug', () => '')

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

const editing = ref(false)
const draft = ref('')
const saving = ref(false)

// 侧边栏跳转另一篇笔记时（组件实例复用），slug 变化立即重取（手动模式，不依赖 useAsyncData 语义）
// 同时重置编辑态：否则会把上一篇笔记的草稿误保存到当前笔记
watch(slug, () => {
  editing.value = false
  draft.value = ''
  loadNote()
})

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode || 500,
    message: error.value.message || '笔记加载失败'
  })
}

const startEdit = () => {
  draft.value = note.value?.content || ''
  editing.value = true
}

const cancelEdit = () => {
  editing.value = false
}

// 编辑态底部工具栏：字数与预估阅读时长（spec 5.4）
const draftChars = computed(() => draft.value.replace(/\s/g, '').length)
const draftMinutes = computed(() => Math.max(1, Math.round(draft.value.length / 400)))

const saveNote = async () => {
  saving.value = true
  try {
    const prevUpdatedAt = note.value?.updatedAt
    await $fetch(`/api/vault/notes/${encodedSlug.value}`, { method: 'PUT', body: { content: draft.value } })

    // 轮询等待 watcher 串行队列同步入库（替代固定 1.5s 硬等待；最长 10s）
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500))
      try {
        const fresh = await requestFetch(`/api/notes/${encodedSlug.value}`)
        // watcher 入库后 updatedAt 会变化（内容真实变化时）
        if (fresh && fresh.updatedAt !== prevUpdatedAt) {
          note.value = fresh
          break
        }
      } catch { /* 尚未入库（watcher 队列忙） */ }
    }
    // 超时兜底：提示但不阻塞流程（vault 文件已写入，最终一致）
    if (note.value?.updatedAt === prevUpdatedAt) {
      toast.warn('已写入笔记文件，但同步稍慢，请稍后刷新查看最新内容')
    } else {
      toast.success('已保存并同步入库')
    }
    editing.value = false
  } catch (e: any) {
    toast.error(e?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const removeNote = async () => {
  const ok = await confirm({
    title: '删除笔记',
    message: `确定删除「${note.value?.title}」？此操作不可恢复，对应的 vault 文件会被一并移除。`,
    detail: `${slug.value}.md`,
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  try {
    await $fetch(`/api/vault/notes/${encodedSlug.value}`, { method: 'DELETE' })
    await refreshNuxtData('vault-tree')
    toast.success('笔记已删除')
    await navigateTo('/notes')
  } catch (e: any) {
    toast.error(e?.data?.message || '删除失败')
  }
}

// 「更多操作」菜单（spec 5.4：标题右侧不再是点了没反应的图标按钮）
const menuOpen = ref(false)
const menuItems = computed(() => [
  { key: 'copy-link', label: '复制笔记链接', icon: Link2 },
  { key: 'copy-path', label: '复制文件路径', icon: FileText },
  { key: 'reveal', label: '在结构树中定位', icon: FolderTree },
  { key: '__sep', label: '' },
  {
    key: 'delete',
    label: '删除笔记',
    icon: Trash2,
    danger: true,
    disabled: !canManage.value,
    reason: canManage.value ? '' : '仅管理员'
  }
])

const copyText = async (text: string, tip: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(tip)
  } catch {
    toast.warn(`复制失败，请手动选择：${text}`)
  }
}

const onMenuSelect = async (key: string) => {
  if (key === 'copy-link') {
    await copyText(`${location.origin}/notes/${encodedSlug.value}`, '已复制笔记链接')
  } else if (key === 'copy-path') {
    await copyText(`${slug.value}.md`, '已复制文件路径')
  } else if (key === 'reveal') {
    sidebarPanel.value = 'tree'
    sidebarOpen.value = true
    revealSlug.value = slug.value
    toast.success('已在结构树中定位')
  } else if (key === 'delete') {
    await removeNote()
  }
}

useHead({
  title: note.value?.title ? `${note.value.title} · 拾光` : '拾光'
})
</script>

<template>
  <div class="max-w-[1060px] mx-auto px-4 sm:px-6 py-8">
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_236px] xl:gap-8">
      <!-- 正文列 -->
      <div class="min-w-0 max-w-[720px] w-full mx-auto xl:mx-0">
        <!-- 操作行：编辑 + 更多操作（≥1280 时目录栏在右侧） -->
        <div v-if="canManage" class="flex items-center justify-end gap-2 mb-4">
          <template v-if="!editing">
            <button
              class="px-3 py-1.5 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
              @click="startEdit"
            ><Pencil class="w-3.5 h-3.5" />编辑</button>
            <Menu v-model:open="menuOpen" :items="menuItems" @select="onMenuSelect">
              <template #trigger>
                <button
                  class="w-9 h-9 rounded-ctl border border-line text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro inline-flex items-center justify-center"
                  title="更多操作"
                  aria-label="更多操作"
                ><MoreHorizontal class="w-4 h-4" /></button>
              </template>
            </Menu>
          </template>
          <template v-else>
            <button
              class="px-3 py-1.5 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
              :disabled="saving"
              @click="cancelEdit"
            ><X class="w-3.5 h-3.5" />取消</button>
            <button
              class="px-3 py-1.5 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] transition-opacity duration-micro disabled:opacity-50 inline-flex items-center gap-1.5"
              :disabled="saving"
              @click="saveNote"
            ><Save class="w-3.5 h-3.5" />{{ saving ? '保存中…' : '保存' }}</button>
          </template>
        </div>

        <!-- 编辑态警示条（spec 5.4） -->
        <div
          v-if="editing"
          class="mb-4 px-3.5 py-2.5 rounded-card border border-line bg-surface-2 flex items-start gap-2"
        >
          <Info class="w-4 h-4 mt-0.5 text-accent shrink-0" />
          <p class="text-ds-sm text-ink-2 leading-summary">
            编辑的是 vault 中的 Markdown 源文件，<b class="font-semibold">保存后写入磁盘，watcher 自动同步入库</b>；同步完成前列表与图谱可能短暂滞后。
          </p>
        </div>

        <ArticleReader v-if="note && !editing" :note="note" />

        <div v-else-if="editing">
          <textarea
            v-model="draft"
            class="w-full h-[62vh] p-4 rounded-card bg-surface-2 border border-line font-mono text-ds-sm leading-prose text-ink focus:border-accent/60 outline-none resize-y transition-colors duration-micro"
            spellcheck="false"
          ></textarea>
          <div class="mt-2 flex items-center justify-between text-[12px] text-ink-3 font-mono">
            <span>{{ draftChars }} 字</span>
            <span>预计 {{ draftMinutes }} 分钟</span>
          </div>
        </div>
      </div>

      <!-- 右侧目录栏（≥1280 常驻；<1280 隐藏并并入正文顶部） -->
      <div v-if="note && !editing" class="hidden xl:block">
        <TocRail :note="note" :backlinks="note.incoming?.length || 0" />
      </div>
    </div>
  </div>
</template>
