<script setup lang="ts">
import { Upload, FolderUp, X, Check, AlertTriangle, FileText, Folder, Info } from 'lucide-vue-next'
import {
  MAX_FILE_BYTES, MAX_TOTAL_BYTES, fmtBytes, fmtLimit
} from '#shared/import-limits'
import {
  preflight, runImport, destRelOf,
  type ImportItem, type ImportResult
} from '~/composables/useImport'
import type { TreeNodeLike } from '~/composables/useNameRule'

const { open, targetDir } = useImportDialog()
const { nameProblem } = useNameRule()
const { canManage } = useRoles()

const tree = ref<TreeNodeLike[]>([])
const items = ref<ImportItem[]>([])
const parentDir = ref('')
const subDir = ref('')
const keepStructure = ref(true)
const subDirError = ref('')
const dragging = ref(false)
const loadingTree = ref(false)

const running = ref(false)
const progress = ref({ uploaded: 0, total: 0, bytes: 0, current: '' })
const result = ref<ImportResult | null>(null)
// 导入完成后清单冻结在"导入那一刻"的判定：否则文件已落盘，重算会全变成"已存在同名笔记"
const frozen = ref<ReturnType<typeof preflight> | null>(null)

const fileInput = ref<HTMLInputElement | null>(null)
const dirInput = ref<HTMLInputElement | null>(null)

const dirPaths = computed(() => {
  const paths: string[] = ['']
  const walk = (arr: TreeNodeLike[], base: string) => {
    for (const n of arr) {
      if (n.type !== 'dir') continue
      const p = base ? `${base}/${n.name}` : n.name
      paths.push(p)
      walk(n.children || [], p)
    }
  }
  walk(tree.value, '')
  return paths
})

const existingFiles = computed(() => {
  const out = new Set<string>()
  const walk = (arr: TreeNodeLike[], base: string) => {
    for (const n of arr) {
      const p = base ? `${base}/${n.name}` : n.name
      if (n.type === 'dir') walk(n.children || [], p)
      else out.add(n.slug || p)
    }
  }
  walk(tree.value, '')
  return out
})

const check = computed(() => frozen.value ?? preflight(items.value, {
  targetDir: parentDir.value,
  subDir: subDir.value.trim(),
  keepStructure: keepStructure.value,
  existingFiles: existingFiles.value
}))

const blocked = computed(() => !frozen.value && check.value.blocks.length > 0)
const targetPreview = computed(() =>
  `content/vault/${[parentDir.value, subDir.value.trim()].filter(Boolean).join('/')}${parentDir.value || subDir.value.trim() ? '/' : ''}`
)

const MAX_PCT_FILES = 80
const filePct = computed(() => Math.min(100, Math.round(check.value.stats.maxSize / MAX_FILE_BYTES * 100)))
const totalPct = computed(() => Math.min(100, Math.round(check.value.stats.willTotal / MAX_TOTAL_BYTES * 100)))
const meterCls = (pct: number, over: boolean) => over ? 'bg-red-500' : pct > MAX_PCT_FILES ? 'bg-amber-500' : 'bg-garden-500'

const loadTree = async () => {
  loadingTree.value = true
  try {
    const res = await $fetch<{ tree: TreeNodeLike[] }>('/api/vault/tree')
    tree.value = res.tree || []
  } catch { tree.value = [] } finally { loadingTree.value = false }
}

const reset = () => {
  items.value = []
  subDir.value = ''
  subDirError.value = ''
  result.value = null
  frozen.value = null
  progress.value = { uploaded: 0, total: 0, bytes: 0, current: '' }
}

watch(open, async (v) => {
  if (!v) return
  reset()
  parentDir.value = targetDir.value || ''
  await loadTree()
})

const addItems = (list: ImportItem[]) => {
  // 后选同 relPath 覆盖前者（同名文件以最后一次选择为准）
  const map = new Map(items.value.map(i => [i.relPath, i]))
  for (const it of list) map.set(it.relPath, it)
  items.value = [...map.values()]
}

const fromFileList = (files: FileList | null, useRelative: boolean): ImportItem[] => {
  if (!files) return []
  return Array.from(files).map((f: any) => ({
    relPath: (useRelative && f.webkitRelativePath) ? f.webkitRelativePath : f.name,
    name: f.name,
    size: f.size,
    file: f as File
  }))
}

const onPickFiles = (e: Event) => {
  const el = e.target as HTMLInputElement
  addItems(fromFileList(el.files, false))
  el.value = ''
}
const onPickDir = (e: Event) => {
  const el = e.target as HTMLInputElement
  addItems(fromFileList(el.files, true))
  el.value = ''
}

// 拖拽：文件与目录都要支持（目录走 FileSystemEntry 递归读取）
const readEntry = async (entry: any, base: string): Promise<ImportItem[]> => {
  if (entry.isFile) {
    const file: File = await new Promise((res, rej) => entry.file(res, rej))
    return [{ relPath: base ? `${base}/${file.name}` : file.name, name: file.name, size: file.size, file }]
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    const out: ImportItem[] = []
    const prefix = base ? `${base}/${entry.name}` : entry.name
    // readEntries 分批返回（每次约 100 条），必须循环到空
    while (true) {
      const batch: any[] = await new Promise((res) => reader.readEntries(res))
      if (!batch.length) break
      for (const e of batch) out.push(...await readEntry(e, prefix))
    }
    return out
  }
  return []
}

const onDrop = async (e: DragEvent) => {
  dragging.value = false
  const dt = e.dataTransfer
  if (!dt) return
  const entries: any[] = Array.from(dt.items || []).map((i: any) => i.webkitGetAsEntry?.()).filter(Boolean)
  if (entries.length) {
    const collected: ImportItem[] = []
    for (const en of entries) collected.push(...await readEntry(en, ''))
    if (collected.length) return addItems(collected)
  }
  addItems(fromFileList(dt.files, false))
}

const validateSubDir = () => {
  const v = subDir.value.trim()
  if (!v) { subDirError.value = ''; return }
  // 复用统一名称规则：与目标父目录下的直接子节点比对
  const siblings = findSiblings(parentDir.value)
  subDirError.value = nameProblem(v, siblings)
}

const findSiblings = (dirPath: string): TreeNodeLike[] => {
  const segs = dirPath.split('/').filter(Boolean)
  let arr = tree.value
  for (const seg of segs) {
    const node = arr.find(n => n.type === 'dir' && n.name === seg)
    if (!node) return []
    arr = node.children || []
  }
  return arr
}

const canImport = computed(() =>
  canManage.value && !running.value && !result.value && items.value.length > 0 && !blocked.value && !subDirError.value
)

const startImport = async () => {
  if (!canImport.value) return
  running.value = true
  const snapshot = check.value
  try {
    const pre = await $fetch<{ jobId: string; accepted: { relPath: string; size: number }[] }>(
      '/api/vault/import/preflight',
      {
        method: 'POST',
        body: {
          targetDir: parentDir.value,
          subDir: subDir.value.trim(),
          keepStructure: keepStructure.value,
          files: snapshot.rows.map(r => ({ relPath: r.relPath, size: r.size }))
        }
      }
    )
    const fileMap = new Map(items.value.map(i => [i.relPath, i.file]))
    progress.value = { uploaded: 0, total: pre.accepted.length, bytes: 0, current: '' }
    const res = await runImport(pre.accepted, fileMap, pre.jobId, (p) => { progress.value = p })
    result.value = res
    frozen.value = snapshot
    await refreshNuxtData(['vault-tree', 'sidebar-tags'])
  } catch (e: any) {
    result.value = {
      ok: false, written: 0, writtenBytes: 0,
      error: e?.data?.message || '导入失败'
    }
    frozen.value = snapshot
  } finally {
    running.value = false
  }
}

const close = () => { open.value = false }
const statusMeta = {
  ok: { label: '可导入', cls: 'text-garden-700 dark:text-garden-400 bg-garden-500/10 border-garden-500/30' },
  bad: { label: '超限', cls: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30' },
  skip: { label: '跳过', cls: 'text-slate-500 dark:text-slate-400 bg-slate-500/10 border-slate-500/30' }
} as const
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[color-mix(in_srgb,var(--ink)_38%,transparent)] backdrop-blur-[2px] p-4 sm:p-8">
      <div class="relative w-full max-w-3xl rounded-overlay border border-line bg-surface shadow-ds3">
        <!-- 头部：关闭键绝对定位钉在右上角（spec 5.8 ② .modal-x），与标题长度/行数无关 -->
        <div class="flex flex-wrap items-center gap-2 px-5 sm:px-6 py-4 pr-14 border-b border-line">
          <Upload class="w-4 h-4 text-accent" />
          <h2 class="text-ds-lg font-semibold text-ink">导入笔记</h2>
          <span class="text-[12px] text-ink-3">单文件 ≤ {{ fmtLimit(MAX_FILE_BYTES) }} · 单批总量 ≤ {{ fmtLimit(MAX_TOTAL_BYTES) }}</span>
        </div>
        <button class="modal-x" type="button" title="关闭" aria-label="关闭导入对话框" @click="close">
          <X class="w-4 h-4" />
        </button>

        <div class="px-5 py-4 space-y-5 max-h-[75vh] overflow-y-auto">
          <!-- ① 选择来源 -->
          <section>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <span class="w-5 h-5 rounded-full bg-garden-500/15 text-garden-700 dark:text-garden-400 text-[12px] flex items-center justify-center font-mono">1</span>
              选择来源
              <span v-if="items.length" class="text-[12px] font-normal text-slate-500 dark:text-slate-400">已选 {{ items.length }} 个文件</span>
            </h3>
            <div
              class="rounded-xl border-2 border-dashed transition-colors p-5 text-center"
              :class="dragging ? 'border-garden-500 bg-garden-500/5' : 'border-slate-300 dark:border-white/15'"
              @dragover.prevent="dragging = true"
              @dragleave.prevent="dragging = false"
              @drop.prevent="onDrop"
            >
              <Upload class="w-6 h-6 mx-auto mb-2 text-slate-400" />
              <p class="text-xs text-slate-600 dark:text-slate-300 mb-3">拖拽文件或整个文件夹到此处（支持 .md / .markdown / .txt）</p>
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
                <button class="px-3 py-1.5 rounded-lg text-xs glass-card hover:border-garden-500/50 transition-all flex items-center justify-center gap-1.5" @click="fileInput?.click();">
                  <FileText class="w-3.5 h-3.5" />选择文件
                </button>
                <button class="px-3 py-1.5 rounded-lg text-xs glass-card hover:border-garden-500/50 transition-all flex items-center justify-center gap-1.5" @click="dirInput?.click();">
                  <FolderUp class="w-3.5 h-3.5" />选择文件夹
                </button>
              </div>
              <input ref="fileInput" type="file" class="hidden" multiple accept=".md,.markdown,.txt,text/markdown,text/plain" @change="onPickFiles" />
              <!-- eslint-disable-next-line vue/attributes-order -->
              <input ref="dirInput" type="file" class="hidden" multiple webkitdirectory directory @change="onPickDir" />
            </div>
          </section>

          <!-- ② 目标位置 -->
          <section>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <span class="w-5 h-5 rounded-full bg-garden-500/15 text-garden-700 dark:text-garden-400 text-[12px] flex items-center justify-center font-mono">2</span>
              目标位置
            </h3>
            <div class="grid sm:grid-cols-2 gap-3">
              <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                父目录
                <select v-model="parentDir" class="px-3 py-2 rounded-lg bg-slate-100 dark:bg-obsidian-900 border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-slate-200 focus:outline-none">
                  <option v-for="p in dirPaths" :key="p" :value="p">{{ p || '/（vault 顶层）' }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                新建子文件夹（可选）
                <input
                  v-model="subDir"
                  placeholder="如：2026 新导入"
                  class="px-3 py-2 rounded-lg bg-slate-100 dark:bg-obsidian-900 border text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
                  :class="subDirError ? 'border-red-500/60' : 'border-slate-200 dark:border-white/10'"
                  @input="validateSubDir"
                />
                <span v-if="subDirError" class="text-[12px] text-red-500">{{ subDirError }}</span>
              </label>
            </div>
            <label class="mt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input v-model="keepStructure" type="checkbox" class="accent-garden-500" />
              保留来源层级（取消勾选则全部拍平到同一目录）
            </label>
            <p class="mt-2 text-[12px] font-mono text-slate-500 dark:text-slate-400 break-all">落点预览：{{ targetPreview }}</p>
          </section>

          <!-- ③ 大小校验 -->
          <section>
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <span class="w-5 h-5 rounded-full bg-garden-500/15 text-garden-700 dark:text-garden-400 text-[12px] flex items-center justify-center font-mono">3</span>
              大小校验
              <span
                v-if="items.length"
                class="text-[12px] px-2 py-0.5 rounded-full border"
                :class="blocked ? 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30' : 'text-garden-700 dark:text-garden-400 bg-garden-500/10 border-garden-500/30'"
              >{{ blocked ? '已阻止' : '校验通过' }}</span>
            </h3>

            <!-- 阻断横幅：把"为什么挡住"说完整 -->
            <div v-for="b in check.blocks" :key="b.kind" class="mb-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2">
              <p class="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle class="w-3.5 h-3.5" />已阻止导入：{{ b.title }}
              </p>
              <p v-if="b.over" class="text-[12px] text-red-500/90 mt-1 font-mono">
                {{ b.kind === 'total' ? `待导入合计 ${fmtBytes(check.stats.willTotal)}　超出 ${fmtBytes(b.over)}` : '' }}
                {{ b.kind === 'count' ? `待导入 ${check.stats.willImport} 个文件　超出 ${b.over} 个` : '' }}
              </p>
              <ul v-if="b.rows.length" class="mt-1 space-y-0.5">
                <li v-for="r in b.rows.slice(0, 8)" :key="r.relPath" class="text-[12px] font-mono text-red-500/90">
                  {{ r.relPath }}　{{ fmtBytes(r.size) }}{{ r.over ? ` · 超出 ${fmtBytes(r.over)}` : '' }} · {{ r.why }}
                </li>
              </ul>
              <p v-if="b.kind === 'file'" class="text-[12px] text-red-500/80 mt-1">单个文件超限无法通过分批绕过，需先在本地拆分。</p>
              <p v-if="b.kind === 'total'" class="text-[12px] text-red-500/80 mt-1">可分批导入（每批小于上限）。</p>
              <p v-if="b.kind === 'dup'" class="text-[12px] text-red-500/80 mt-1">可在结构树里右键重命名旧笔记，或换一个子文件夹。</p>
            </div>

            <template v-if="items.length">
              <!-- 两条上限计量条 -->
              <div class="space-y-2 mb-3">
                <div>
                  <div class="flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400">
                    <span>最大单文件</span>
                    <span class="font-mono">{{ fmtBytes(check.stats.maxSize) }} / {{ fmtLimit(MAX_FILE_BYTES) }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden mt-1">
                    <div class="h-full transition-all" :class="meterCls(filePct, check.stats.maxSize > MAX_FILE_BYTES)" :style="{ width: filePct + '%' }"></div>
                  </div>
                </div>
                <div>
                  <div class="flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400">
                    <span>待导入合计{{ check.stats.skipped ? `（已跳过 ${check.stats.skipped} 个不计入）` : '' }}</span>
                    <span class="font-mono">{{ fmtBytes(check.stats.willTotal) }} / {{ fmtLimit(MAX_TOTAL_BYTES) }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden mt-1">
                    <div class="h-full transition-all" :class="meterCls(totalPct, check.stats.willTotal > MAX_TOTAL_BYTES)" :style="{ width: totalPct + '%' }"></div>
                  </div>
                </div>
              </div>

              <!-- 逐文件清单 -->
              <div class="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5 max-h-56 overflow-y-auto">
                <div v-for="r in check.rows" :key="r.relPath" class="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                  <span class="px-1.5 py-0.5 rounded border shrink-0" :class="statusMeta[r.status].cls">{{ statusMeta[r.status].label }}</span>
                  <span class="flex-1 truncate font-mono text-slate-700 dark:text-slate-300" :title="r.relPath">{{ r.relPath }}</span>
                  <span class="hidden sm:inline font-mono text-slate-500 dark:text-slate-400 shrink-0">{{ fmtBytes(r.size) }}</span>
                  <span class="text-slate-400 dark:text-slate-500 shrink-0 max-w-[45%] truncate" :title="r.why">{{ r.why }}</span>
                </div>
              </div>
              <p class="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
                可导入 {{ check.stats.willImport }} · 跳过 {{ check.stats.skipped }} ·
                超限 {{ check.rows.filter(r => r.status === 'bad').length }}
              </p>
            </template>
            <p v-else class="text-xs text-slate-500 dark:text-slate-400">尚未选择文件。</p>
          </section>

          <!-- ④ 导入结果 -->
          <section v-if="result">
            <h3 class="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <span class="w-5 h-5 rounded-full bg-garden-500/15 text-garden-700 dark:text-garden-400 text-[12px] flex items-center justify-center font-mono">4</span>
              导入结果
            </h3>
            <div class="rounded-xl border px-3 py-3" :class="result.ok ? 'border-garden-500/40 bg-garden-500/5' : 'border-red-500/40 bg-red-500/10'">
              <p v-if="result.ok" class="text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Check class="w-3.5 h-3.5 text-garden-600 dark:text-garden-400" />
                成功 {{ result.written }} 篇 · 写入 {{ fmtBytes(result.writtenBytes) }} · 目标目录
                <span class="font-mono">{{ [parentDir, subDir.trim()].filter(Boolean).join('/') || '（vault 顶层）' }}</span>
              </p>
              <p v-else class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle class="w-3.5 h-3.5" />{{ result.error }}
              </p>
              <p v-if="result.ingest" class="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                入库 {{ result.ingest.ingested }}/{{ result.ingest.total }} · 耗时 {{ (result.ingest.elapsedMs / 1000).toFixed(1) }}s
                <span v-if="result.ingest.pending"> · 剩余 {{ result.ingest.pending }} 篇后台继续入库</span>
                <span v-if="result.ingest.failed.length"> · 失败 {{ result.ingest.failed.length }} 篇</span>
              </p>
              <ul v-if="check.rows.some(r => r.status === 'skip')" class="mt-2 space-y-0.5">
                <li v-for="r in check.rows.filter(r => r.status === 'skip')" :key="'s' + r.relPath" class="text-[12px] text-slate-500 dark:text-slate-400">
                  跳过 {{ r.relPath }} —— {{ r.why }}
                </li>
              </ul>
              <p class="mt-2 text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Info class="w-3 h-3" />服务端已按写入后的真实字节数复核一次。
              </p>
            </div>
          </section>

          <!-- 上传进度 -->
          <section v-if="running">
            <div class="flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400 mb-1">
              <span class="truncate font-mono">{{ progress.current || '正在上传…' }}</span>
              <span class="font-mono">{{ progress.uploaded }}/{{ progress.total }} · {{ fmtBytes(progress.bytes) }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div class="h-full bg-garden-500 transition-all" :style="{ width: (progress.total ? Math.round(progress.uploaded / progress.total * 100) : 0) + '%' }"></div>
            </div>
          </section>
        </div>

        <!-- 底部动作（<640：单列 + 按钮拉通） -->
        <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-t border-line">
          <p class="text-[12px] text-slate-500 dark:text-slate-400 text-center sm:text-left">
            <template v-if="!canManage">当前身份为普通用户，没有导入权限</template>
            <template v-else-if="loadingTree">正在读取目录树…</template>
            <template v-else-if="blocked">存在阻止项，处理后可重新校验</template>
            <template v-else-if="result">导入已结束</template>
            <template v-else>导入只在通过校验后才会写入 vault</template>
          </p>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <button v-if="!result" class="flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs glass-card hover:border-garden-500/50 transition-all" @click="reset">清空选择</button>
            <button class="flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs glass-card hover:border-garden-500/50 transition-all" @click="close">
              {{ result ? '关闭' : '取消' }}
            </button>
            <button
              v-if="!result"
              class="flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-garden-500 to-emerald-600 shadow-lg shadow-garden-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!canImport"
              :title="blocked ? '存在阻止项：' + check.blocks.map(b => b.title).join('；') : ''"
              @click="startImport"
            >
              {{ running ? '导入中…' : `开始导入${check.stats.willImport ? `（${check.stats.willImport}）` : ''}` }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
