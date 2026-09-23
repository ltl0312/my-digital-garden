<script setup lang="ts">
import { Pencil, MoreHorizontal, Link2, FolderTree, FileText, Trash2, Save, X, Info, Tags as TagsIcon } from 'lucide-vue-next'

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

// 编辑态同步到全局：手机端底部 TabBar 在编辑态需让位给编辑器底部操作条
// （交付物 §5 ⑤ / 第 05 屏 —— 编辑态没有底部导航）。离开页面时复位，
// 否则返回列表页后 TabBar 会一直缺失。
const editorOpen = useState<boolean>('shell-editor-open', () => false)
watch(editing, (v) => { editorOpen.value = v }, { immediate: true })
onBeforeUnmount(() => { editorOpen.value = false })

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
  { key: 'meta', label: '标签与成熟度', icon: TagsIcon },
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

// ── 标签与成熟度编辑（元数据可视化管理）──
// frontmatter 显式写 maturity 会被当作人工指定、永不自动升档，所以这里提供
// 「跟随自动判定」选项（= 删除 frontmatter 的 maturity 行）。
const metaOpen = ref(false)
const metaTags = ref<string[]>([])
const metaMaturity = ref('auto') // 'auto' = 不写 maturity（走自动判定）
const metaSaving = ref(false)
const metaInput = ref('')

const openMeta = () => {
  metaTags.value = (note.value?.tags || [])
    .map((t: any) => t?.tag?.name ?? t)
    .filter((x: any) => typeof x === 'string' && !!x)
  // 关键：DB 里的 maturity 是「判定/人工」的最终结果，不能直接当人工值回显 ——
  // 否则自动判定出的 SEEDLING 会被当成人工锁定，保存时又写回 frontmatter、再次锁死。
  // maturityExplicit（服务端读原文件判定）为 true 才回显具体档位。
  metaMaturity.value = note.value?.maturityExplicit && note.value?.maturity
    ? String(note.value.maturity).toUpperCase()
    : 'auto'
  metaInput.value = ''
  metaOpen.value = true
}

const addMetaTag = () => {
  const t = metaInput.value.trim()
  if (!t) return
  if (metaTags.value.includes(t)) { toast.warn('标签已存在'); return }
  if (metaTags.value.length >= 12) { toast.warn('最多 12 个标签'); return }
  metaTags.value.push(t)
  metaInput.value = ''
}

const removeMetaTag = (t: string) => {
  metaTags.value = metaTags.value.filter(x => x !== t)
}

const saveMeta = async () => {
  if (!note.value) return
  metaSaving.value = true
  try {
    await $fetch(`/api/vault/notes/${encodedSlug.value}`, {
      method: 'PATCH',
      body: {
        tags: metaTags.value,
        maturity: metaMaturity.value === 'auto' ? null : metaMaturity.value
      }
    })
    metaOpen.value = false
    await loadNote()
    toast.success('已更新标签与成熟度')
  } catch (e: any) {
    toast.error(e?.data?.message || '保存失败')
  } finally {
    metaSaving.value = false
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
  } else if (key === 'meta') {
    openMeta()
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

    <!-- 标签与成熟度编辑（「更多操作 → 标签与成熟度」） -->
    <AppDialog v-model:open="metaOpen" title="标签与成熟度" size="sm">
      <div class="space-y-4">
        <div>
          <span class="block text-[12px] text-ink-3 mb-1.5">标签（回车添加，最多 12 个）</span>
          <div class="flex flex-wrap gap-1.5 mb-2">
            <span
              v-for="t in metaTags"
              :key="t"
              class="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-line bg-surface-2 text-ds-sm text-ink-2"
            >
              {{ t }}
              <button
                type="button"
                class="text-ink-3 hover:text-danger transition-colors duration-micro"
                :aria-label="`删除标签 ${t}`"
                @click="removeMetaTag(t)"
              ><X class="w-3 h-3" /></button>
            </span>
            <span v-if="!metaTags.length" class="text-ds-sm text-ink-3">（暂无标签）</span>
          </div>
          <input
            v-model="metaInput"
            placeholder="输入标签后回车"
            class="w-full px-3 py-2 rounded-ctl bg-surface-2 border border-line text-ds-sm text-ink placeholder-ink-3 focus:outline-none focus:border-accent/60 transition-colors duration-micro"
            @keydown.enter.prevent="addMetaTag"
          />
        </div>

        <div>
          <span class="block text-[12px] text-ink-3 mb-1.5">成熟度</span>
          <AppSelect
            v-model="metaMaturity"
            :options="[
              { value: 'auto', label: '跟随自动判定（推荐）' },
              { value: 'SEEDLING', label: '幼苗 · 人工锁定' },
              { value: 'GROWING', label: '成长中 · 人工锁定' },
              { value: 'EVERGREEN', label: '常青 · 人工锁定' }
            ]"
          />
          <p class="mt-1.5 text-[12px] text-ink-3 leading-summary">
            frontmatter 写了 maturity 会被视为人工指定、永不自动升档；选「跟随自动判定」即删除该行。
            自动升档条件 —— 成长中：正文 ≥400 字且章节区块 ≥3 个；常青：五个标准区块齐全 +
            正文 ≥800 字且含代码块/表格 ≥2 个 + 被其他笔记 [[链接]] ≥2 次 + 创建满 14 天。
          </p>
        </div>
      </div>
      <template #footer>
        <button
          class="px-3.5 py-2 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
          @click="metaOpen = false"
        >取消</button>
        <button
          class="px-3.5 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] transition-opacity duration-micro disabled:opacity-50"
          :disabled="metaSaving"
          @click="saveMeta"
        >{{ metaSaving ? '保存中…' : '保存' }}</button>
      </template>
    </AppDialog>
  </div>
</template>
