<script setup lang="ts">
import { Pencil, MoreHorizontal, Link2, FolderTree, FileText, Trash2, Save, X, Info, History, Tags as TagsIcon, ListTree, Sparkles } from 'lucide-vue-next'

const route = useRoute()
const { canManage } = useRoles()
const toast = useToast()
const { confirm } = useConfirm()
// 「标签 · 领域自动分配」：统一入口（分片提交 + 生成后打开审核面板并只看这一篇）
const { reviewForSlugs } = useSuggestionReview()

// 「在结构树中定位」所需的跨组件状态（spec 5.4）
const sidebarOpen = useState<boolean>('shell-sidebar-open', () => true)
const sidebarPanel = useState<'tree' | 'domain' | 'tag'>('shell-sidebar-panel', () => 'tree')
const revealSlug = useState<string>('shell-reveal-slug', () => '')

// catch-all 路由下 params.slug 为数组，join 还原多级 slug
const slug = computed(() => {
  const s = route.params.slug
  return Array.isArray(s) ? s.join('/') : (s ?? '')
})

// 逐段编码（保留 / 为路径分隔符；整体 encodeURIComponent 会生成 %2F 导致路由失配 404）
const encodedSlug = computed(() => slug.value.split('/').map(encodeURIComponent).join('/'))

const requestFetch = useRequestFetch()
const router = useRouter()
const note = ref<any>(null)
const error = ref<any>(null)

const loadNote = async () => {
  try {
    note.value = await requestFetch(`/api/notes/${encodedSlug.value}`)
    error.value = null
  } catch (e: any) {
    // 失败必须连正文一起清掉：留着上一篇会让用户以为「已经切过去了」，
    // 静默展示另一篇笔记比报错严重得多（旧实现只设 error，模板没有 error 分支）。
    note.value = null
    error.value = e
  }
}

// SSR 初始数据
await loadNote()

const editing = ref(false)
const draft = ref('')

// 保存状态机（取代原先的 saving 布尔）：一次 PUT 定输赢，失败也分得清是哪一种。
// 字面量与 app/components/SaveState.vue 导出的 SaveStatus 逐字一致（结构相同即可赋值）。
type SaveStatus = 'idle' | 'saving' | 'queued' | 'saved' | 'timeout' | 'conflict'
const saveStatus = ref<SaveStatus>('idle')
/** 最近一次成功写入的时刻：响应的 updatedAt，拿不到就用本地时刻 */
const savedAt = ref('')
/** 409 三选一对话框 */
const conflictOpen = ref(false)
/** 顶部「已恢复上次未保存的编辑」提示 */
const draftRestored = ref(false)
const busy = computed(() => saveStatus.value === 'saving')
const draftStore = useDraft()

// 编辑态同步到全局：手机端底部 TabBar 在编辑态需让位给编辑器底部操作条
// （交付物 §5 ⑤ / 第 05 屏 —— 编辑态没有底部导航）。离开页面时复位，
// 否则返回列表页后 TabBar 会一直缺失。
const editorOpen = useState<boolean>('shell-editor-open', () => false)
watch(editing, (v) => { editorOpen.value = v }, { immediate: true })
onBeforeUnmount(() => { editorOpen.value = false })

// ── 未保存修改的判定与草稿恢复 ────────────────────────────────
// 只算「编辑态 + 与正文不同」：退出编辑后 draft 仍留着最后内容，那不算未保存。
const isDirty = computed(() => editing.value && draft.value !== (note.value?.content ?? ''))

/** 恢复本地草稿：命中且与正文不同才恢复，并直接进编辑态（只恢复不编辑等于没恢复） */
const restoreDraft = (): boolean => {
  if (!note.value) return false
  const rec = draftStore.read(slug.value)
  if (!rec) return false
  if (rec.content === (note.value.content ?? '')) { draftStore.clear(slug.value); return false }
  draft.value = rec.content
  editing.value = true
  draftRestored.value = true
  return true
}

/** 顶部提示条上的「丢弃」：清 key、回到磁盘正文、退出编辑态 */
const discardRestored = () => {
  draftStore.clear(slug.value)
  draft.value = note.value?.content ?? ''
  editing.value = false
  draftRestored.value = false
  saveStatus.value = 'idle'
}

const encodeSlugPath = (s: string) => s.split('/').map(encodeURIComponent).join('/')

/** 切篇 / 重试前的状态复位：旧正文、旧状态、旧草稿提示一律不带进下一篇 */
const resetForSlug = () => {
  editing.value = false
  draft.value = ''
  draftRestored.value = false
  conflictOpen.value = false
  saveStatus.value = 'idle'
  savedAt.value = ''
  note.value = null
  error.value = null
}

// 路由回退会让 slug 再变一次；用这个标志跳过一次守卫，
// 免得拿撤销后的路由再问用户一遍「要不要放弃」。
let revertingRoute = false

// 侧边栏跳转另一篇笔记时（组件实例复用），slug 变化立即重取（手动模式，不依赖 useAsyncData 语义）。
// 切换前必须拦一次：草稿是「这一篇」的，静默丢弃正是原来最伤的那种丢失。
watch(slug, async (_next, prev) => {
  if (revertingRoute) { revertingRoute = false; return }
  if (isDirty.value && prev) {
    const ok = await confirm({
      title: '放弃未保存的修改？',
      message: '当前笔记还有未保存的修改。继续切换会先把它们存成本地草稿，重新进入这一篇时才能恢复。',
      detail: `${prev}.md`,
      confirmText: '仍然切换',
      cancelText: '留在这里',
      danger: true
    })
    if (!ok) {
      revertingRoute = true
      await router.replace(`/notes/${encodeSlugPath(prev)}`)
      return
    }
    // 确认切换：先把草稿落盘（不是删掉），回头再进来还能恢复
    draftStore.flush(prev, draft.value)
  }
  resetForSlug()
  await loadNote()
  if (!error.value) restoreDraft()
})

// SSR 首次加载失败仍走整页错误页；客户端换篇失败走页内错误态 + 重试，
// 否则一次网络抖动就得整页刷新
if (error.value && !import.meta.client) {
  throw createError({
    statusCode: error.value.statusCode || 500,
    message: error.value.message || '笔记加载失败'
  })
}

const startEdit = () => {
  draftRestored.value = false
  // 有本地草稿就先恢复：直接覆盖成磁盘正文等于悄悄丢掉上次的输入
  if (restoreDraft()) return
  draft.value = note.value?.content || ''
  editing.value = true
}

const cancelEdit = async () => {
  if (isDirty.value) {
    const ok = await confirm({
      title: '放弃未保存的修改？',
      message: '这次修改还没有保存，放弃后无法找回（这篇笔记的本地草稿也会一并清除）。',
      detail: `${slug.value}.md`,
      confirmText: '放弃修改',
      cancelText: '继续编辑',
      danger: true
    })
    if (!ok) return
  }
  draftStore.clear(slug.value)
  draft.value = note.value?.content ?? ''
  draftRestored.value = false
  editing.value = false
  saveStatus.value = 'idle'
}

/** 页内错误态的重试：只重取当前这篇，不动其它状态 */
const retryLoad = async () => {
  await loadNote()
  if (!error.value) restoreDraft()
}

// 编辑态底部工具栏：字数与预估阅读时长（spec 5.4）
const draftChars = computed(() => draft.value.replace(/\s/g, '').length)
const draftMinutes = computed(() => Math.max(1, Math.round(draft.value.length / 400)))

// ── 保存：一次 PUT 定输赢 ─────────────────────────────────────
// 旧实现 PUT 后每 500ms 轮询 GET 比对 updatedAt、最长 10s，超时就报「同步稍慢」：
// 但服务端在内容没变时**本来就会跳过重渲染**（不写库、updatedAt 不变），
// 于是「打开编辑器不动就点保存」必然空等 10 秒再弹一句假故障。现在只发一次写请求，
// 15s 只用于兜住真的挂死的请求。
const SAVE_TIMEOUT_MS = 15_000
let saveAbort: AbortController | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null

const isAbortError = (e: any) => e?.name === 'AbortError' || e?.cause?.name === 'AbortError'

const isConflictError = (e: any) => {
  const status = e?.statusCode ?? e?.status ?? e?.response?.status
  const code = e?.data?.code ?? e?.response?._data?.code
  return status === 409 && code === 'NOTE_CONFLICT'
}

/** 写入成功后的本地收敛：把细节交给服务端返回的 version/updatedAt，不再靠轮询猜 */
const applySaved = (res: any) => {
  const at = typeof res?.updatedAt === 'string' ? res.updatedAt : new Date().toISOString()
  // 服务端回了 version 或 updatedAt（或显式 synced）才算「已入库」；只回 {ok:true} 说明
  // 文件写完了、watcher 还没跟上 —— 那是 queued，不是失败
  const synced = !!res && (res.version !== undefined || res.updatedAt !== undefined || res.synced === true)
  note.value = {
    ...note.value,
    content: draft.value,
    updatedAt: at,
    ...(res?.version !== undefined ? { version: res.version } : {})
  }
  savedAt.value = at
  draftStore.clear(slug.value)
  draftRestored.value = false
  editing.value = false
  saveStatus.value = synced ? 'saved' : 'queued'
  toast.success(synced ? '已保存' : '已写入 vault，等待入库')
  if (!synced) settleQueued()
}

/** 入库滞后时补取一次（**一次性**，不是轮询）：补不到就停在 queued —— 文件已在 vault 里 */
const settleQueued = () => {
  if (settleTimer) clearTimeout(settleTimer)
  const atSlug = encodedSlug.value
  settleTimer = setTimeout(async () => {
    settleTimer = null
    try {
      const fresh = await requestFetch<any>(`/api/notes/${atSlug}`)
      if (!fresh || encodedSlug.value !== atSlug) return
      if (fresh.content !== (note.value?.content ?? '')) return
      note.value = fresh
      savedAt.value = typeof fresh.updatedAt === 'string' ? fresh.updatedAt : savedAt.value
      saveStatus.value = 'saved'
    } catch { /* 入库慢不代表写失败：保持 queued 文案，不打扰用户 */ }
  }, 1200)
}

const saveNote = async (opts: { forceOverwrite?: boolean } = {}) => {
  if (!note.value) return
  // 空保存短路：内容没变就不发请求（服务端也会跳过重渲染，请求本身就是噪声）
  if (!opts.forceOverwrite && draft.value === (note.value.content ?? '')) {
    toast.success('内容无变更')
    saveStatus.value = 'idle'
    return
  }

  saveAbort?.abort()
  const ctrl = new AbortController()
  saveAbort = ctrl
  const timer = setTimeout(() => ctrl.abort(), SAVE_TIMEOUT_MS)
  saveStatus.value = 'saving'
  try {
    // baseVersion = 详情响应里的 version；拿不到就不带（服务端按无版本处理，保持兼容）
    const base = opts.forceOverwrite ? undefined : note.value?.version
    const res = await $fetch<any>(`/api/vault/notes/${encodedSlug.value}`, {
      method: 'PUT',
      body: base === undefined || base === null
        ? { content: draft.value }
        : { content: draft.value, baseVersion: base },
      signal: ctrl.signal
    })
    applySaved(res)
  } catch (e: any) {
    if (isAbortError(e)) {
      // 超时不是「肯定没写进去」：请求可能已到服务端，所以给「重试」而不是「重新加载」
      saveStatus.value = 'timeout'
      toast.error('写入超时，可重试')
      return
    }
    if (isConflictError(e)) {
      saveStatus.value = 'conflict'
      conflictOpen.value = true
      return
    }
    saveStatus.value = 'idle'
    toast.error(e?.data?.message || '保存失败')
  } finally {
    clearTimeout(timer)
    if (saveAbort === ctrl) saveAbort = null
  }
}

// ── 409：覆盖磁盘 / 放弃我的修改 / 取消 ──────────────────────
const conflictOverwrite = async () => {
  conflictOpen.value = false
  await saveNote({ forceOverwrite: true })
  if (saveStatus.value !== 'saved' && saveStatus.value !== 'queued') return
  // 覆盖成功后必须把 baseVersion 重新对齐，否则下一次保存还拿旧版本再撞一次 409
  if (note.value?.version !== undefined) return
  try {
    const fresh = await requestFetch<any>(`/api/notes/${encodedSlug.value}`)
    if (fresh && note.value) {
      // 只取 version：正文以刚写下去的内容为准，不能被滞后的 DB 结果倒灌
      note.value = { ...note.value, version: fresh.version }
    }
  } catch { /* 拿不到就等下次进页面再对齐 */ }
}

const conflictDiscard = async () => {
  conflictOpen.value = false
  try {
    const fresh = await requestFetch<any>(`/api/notes/${encodedSlug.value}`)
    note.value = fresh
    draft.value = fresh?.content ?? ''
  } catch (e: any) {
    toast.error(e?.data?.message || '重新读取失败')
    return
  }
  draftStore.clear(slug.value)
  draftRestored.value = false
  saveStatus.value = 'idle'
  toast.warn('已放弃本地修改，载入磁盘最新内容')
}

// 取消：什么都不动 —— 保持编辑态、保住草稿，状态条停在 conflict 提醒用户还有冲突未决
const conflictCancel = () => {
  conflictOpen.value = false
}

// ── 草稿落盘（800ms 防抖在 useDraft 里） ─────────────────────
// 只在编辑态写：非编辑态下 draft 是上一次编辑的残留，写下去会把磁盘上的真草稿覆盖成旧内容
watch(draft, (v) => {
  if (!editing.value) return
  if (v === (note.value?.content ?? '')) return
  draftStore.write(slug.value, v)
}, { flush: 'post' })

// ── 浏览器级离开拦截（client-only） ──────────────────────────
// 单页路由切篇由 watch(slug) 拦；这里的 beforeunload 只管关标签页 / 刷新 / 外链跳转。
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (!isDirty.value) return
  // 兜住最后 <800ms 的输入：用户可能马上选「离开」
  draftStore.flush(slug.value, draft.value)
  e.preventDefault()
  e.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  // 进页面即恢复：SSR 首帧只有正文，本地草稿只能在客户端读
  if (note.value) restoreDraft()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (settleTimer) clearTimeout(settleTimer)
  saveAbort?.abort()
  // 跳到别的页面（不是切篇）：草稿只活在内存里，先落盘再走
  if (isDirty.value) draftStore.flush(slug.value, draft.value)
})

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

// ── 移动端两种浮层（交付物第 04 / 19 屏）──────────────────────
// 目录：<1280 右侧栏不显示，目录此前在手机与平板上**完全不可见**（功能丢失），
// 现由底部抽屉承载 —— 内容仍是同一个 TocRail 组件，不另起一份实现。
const tocOpen = ref(false)
// 更多操作：手机端顶栏空间有限，用贴底面板承载（桌面端仍是页内下拉菜单）
const moreSheetOpen = ref(false)
const headerActionsReady = useState<boolean>('shell-header-ready', () => false)

const menuItems = computed(() => [
  { key: 'copy-link', label: '复制笔记链接', icon: Link2 },
  { key: 'copy-path', label: '复制文件路径', icon: FileText },
  { key: 'reveal', label: '在结构树中定位', icon: FolderTree },
  { key: 'meta', label: '标签与成熟度', icon: TagsIcon },
  {
    key: 'suggest',
    label: '标签 · 领域自动分配',
    icon: Sparkles,
    disabled: !canManage.value,
    reason: canManage.value ? '' : '仅管理员'
  },
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

/** 手机端「更多」面板的条目（交付物第 19 屏）：在既有菜单前插入「编辑笔记」。
 *  手机端页内操作行已隐藏、编辑入口必须搬到这里，否则会丢功能。 */
const moreSheetItems = computed(() => {
  const head = canManage.value ? [{ key: 'edit', label: '编辑笔记', icon: Pencil }] : []
  return [...head, ...menuItems.value]
})

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
  if (key === 'edit') {
    // 手机端「更多」面板里的编辑入口（桌面端没有这一项，编辑是独立按钮）
    startEdit()
  } else if (key === 'copy-link') {
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
  } else if (key === 'suggest') {
    // 对这一篇重新判定标签与领域 → 生成待审 → 打开审核面板并只看这一篇
    await reviewForSlugs([slug.value])
  } else if (key === 'delete') {
    await removeNote()
  }
}

useHead({
  title: note.value?.title ? `${note.value.title} · 拾光` : '拾光'
})
</script>

<template>
  <div class="max-w-[1060px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
    <!-- 顶栏动作（手机 <640，交付物第 04 / 05 屏）：Teleport 到布局顶栏的插槽。
         等布局挂载完成后再渲染 —— 目标节点不在 DOM 时 Vue 会告警并丢弃内容。 -->
    <ClientOnly>
      <Teleport v-if="headerActionsReady" to="#shell-header-actions">
        <template v-if="editing">
          <button
            class="h-[34px] px-2.5 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
            :disabled="busy"
            @click="cancelEdit"
          >取消</button>
          <button
            class="h-[34px] px-3 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] transition-opacity duration-micro disabled:opacity-50"
            :disabled="busy"
            @click="saveNote()"
          >{{ busy ? '保存中…' : '保存' }}</button>
        </template>
        <template v-else>
          <button
            class="w-[38px] h-[38px] rounded-ctl flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
            title="目录与属性"
            aria-label="目录与属性"
            @click="tocOpen = true"
          ><ListTree class="w-4 h-4" /></button>
          <button
            class="w-[38px] h-[38px] rounded-ctl flex items-center justify-center text-ink-2 hover:bg-surface-3 transition-colors duration-micro"
            title="更多操作"
            aria-label="更多操作"
            @click="moreSheetOpen = true"
          ><MoreHorizontal class="w-4 h-4" /></button>
        </template>
      </Teleport>
    </ClientOnly>

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_236px] xl:gap-8">
      <!-- 正文列 -->
      <div class="min-w-0 max-w-measure w-full mx-auto xl:mx-0">
        <!-- 操作行（≥640）：目录 + 编辑 / 更多操作。
             <1280 右侧栏不显示，目录改由底部抽屉承载，所以这里补一个「目录」入口 ——
             此前 <1280 时目录在手机与平板上完全不可见（功能丢失）。
             手机端整行隐藏：动作已搬到顶栏插槽，拇指区不放这些。 -->
        <div class="hidden sm:flex items-center justify-end gap-2 mb-4">
          <button
            v-if="note && !editing"
            class="xl:hidden px-3 py-1.5 rounded-ctl text-ds-sm border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5"
            @click="tocOpen = true"
          ><ListTree class="w-3.5 h-3.5" />目录</button>
          <template v-if="canManage">
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
              :disabled="busy"
              @click="cancelEdit"
            ><X class="w-3.5 h-3.5" />取消</button>
            <button
              class="px-3 py-1.5 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] transition-opacity duration-micro disabled:opacity-50 inline-flex items-center gap-1.5"
              :disabled="busy"
              @click="saveNote()"
            ><Save class="w-3.5 h-3.5" />{{ busy ? '保存中…' : '保存' }}</button>
            </template>
          </template>
        </div>

        <!-- 恢复本地草稿（进页面 / 点编辑时命中未保存草稿才有） -->
        <div
          v-if="draftRestored"
          class="mb-4 px-3.5 py-2.5 rounded-card border border-accent/40 bg-surface-2 flex items-center gap-2"
        >
          <History class="w-4 h-4 text-accent-text shrink-0" />
          <p class="flex-1 text-ds-sm text-ink-2 leading-summary">已恢复上次未保存的编辑</p>
          <button
            type="button"
            class="shrink-0 h-[26px] px-2 rounded-xs text-ds-xs border border-line text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors duration-micro"
            @click="discardRestored"
          >丢弃</button>
        </div>

        <!-- 编辑态警示条（spec 5.4） -->
        <div
          v-if="editing"
          class="mb-4 px-3.5 py-2.5 rounded-card border border-line bg-surface-2 flex items-start gap-2"
        >
          <Info class="w-4 h-4 mt-0.5 text-accent-text shrink-0" />
          <p class="text-ds-sm text-ink-2 leading-summary">
            编辑的是 vault 中的 Markdown 源文件，<b class="font-semibold">保存后写入磁盘，watcher 自动同步入库</b>；同步完成前列表与统计可能短暂滞后。
          </p>
        </div>

        <!-- 保存状态条：一行的位置说清「写没写进去、要不要重试、是不是被别处改过」 -->
        <SaveState
          v-if="editing || saveStatus !== 'idle'"
          :status="saveStatus"
          :saved-at="savedAt"
          class="mb-4"
          @retry="saveNote()"
        />

        <!-- 取数失败：先给错误态，绝不能退回上一篇正文（那会让用户以为切换成功了） -->
        <EmptyState
          v-if="error && !editing"
          variant="error"
          title="笔记加载失败"
          :reason="error?.data?.message || error?.message || '网络或服务端异常，未能取到这篇笔记。'"
          @retry="retryLoad"
        />

        <ArticleReader v-else-if="note && !editing" :note="note" />

        <div v-else-if="editing">
          <textarea
            v-model="draft"
            class="w-full h-[62vh] p-4 rounded-card bg-surface-2 border border-line-strong font-mono text-ds-sm leading-prose text-ink focus:border-accent/60 resize-y transition-colors duration-micro"
            spellcheck="false"
          ></textarea>
          <div class="mt-2 flex items-center justify-between text-ds-xs text-ink-3 font-mono">
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
          <span class="block text-ds-xs text-ink-3 mb-1.5">标签（回车添加，最多 12 个）</span>
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
            class="w-full px-3 py-2 rounded-ctl bg-surface-2 border border-line-strong text-ds-sm text-ink placeholder-ink-3 focus:border-accent/60 transition-colors duration-micro"
            @keydown.enter.prevent="addMetaTag"
          />
        </div>

        <div>
          <span class="block text-ds-xs text-ink-3 mb-1.5">成熟度</span>
          <AppSelect
            v-model="metaMaturity"
            :options="[
              { value: 'auto', label: '跟随自动判定（推荐）' },
              { value: 'SEEDLING', label: '幼苗 · 人工锁定' },
              { value: 'GROWING', label: '成长中 · 人工锁定' },
              { value: 'EVERGREEN', label: '常青 · 人工锁定' }
            ]"
          />
          <p class="mt-1.5 text-ds-xs text-ink-3 leading-summary">
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

    <!-- 409 三选一：覆盖 / 放弃 / 取消。三个后果差别极大，所以每个选项都带一句后果说明，
         而不是「确定 / 取消」这种要靠用户猜的出口。 -->
    <AppDialog v-model:open="conflictOpen" title="内容已被其他位置修改" size="sm">
      <div class="space-y-3">
        <p class="text-ds-sm text-ink-2 leading-summary">
          这篇笔记的磁盘内容在你编辑期间被改过。继续保存会覆盖磁盘上的新版本，请选择怎么处理。
        </p>
        <button
          type="button"
          class="w-full text-left px-3.5 py-2.5 rounded-ctl border border-line hover:bg-surface-3 transition-colors duration-micro"
          @click="conflictOverwrite"
        >
          <span class="block text-ds-sm font-semibold text-ink">覆盖磁盘</span>
          <span class="block text-ds-xs text-ink-3 mt-0.5 leading-summary">用编辑器里的内容写下磁盘，磁盘上的新版本会被替换。</span>
        </button>
        <button
          type="button"
          class="w-full text-left px-3.5 py-2.5 rounded-ctl border border-line hover:bg-surface-3 transition-colors duration-micro"
          @click="conflictDiscard"
        >
          <span class="block text-ds-sm font-semibold text-ink">放弃我的修改</span>
          <span class="block text-ds-xs text-ink-3 mt-0.5 leading-summary">重新读取磁盘最新内容覆盖编辑器，本地修改丢弃。</span>
        </button>
        <button
          type="button"
          class="w-full text-left px-3.5 py-2.5 rounded-ctl border border-line hover:bg-surface-3 transition-colors duration-micro"
          @click="conflictCancel"
        >
          <span class="block text-ds-sm font-semibold text-ink">取消</span>
          <span class="block text-ds-xs text-ink-3 mt-0.5 leading-summary">保持编辑态和草稿不动，稍后再决定。</span>
        </button>
      </div>
    </AppDialog>

    <!-- 目录与属性（<1280，交付物第 04 屏）：内容仍是同一个 TocRail 组件，
         底部抽屉只是它在窄屏下的载体 —— 未新增任何目录/属性信息 -->
    <Sheet v-model:open="tocOpen" title="目录与属性" closable>
      <TocRail v-if="note" :note="note" :backlinks="note.incoming?.length || 0" variant="sheet" />
    </Sheet>

    <!-- 更多操作（手机 <640，交付物第 19 屏）：与桌面下拉菜单共用同一份 menuItems -->
    <ActionSheet
      v-model:open="moreSheetOpen"
      :items="moreSheetItems"
      :title="note?.title || ''"
      subtitle="更多操作"
      @select="onMenuSelect"
    />
  </div>
</template>
