<script setup lang="ts">
// 库备份面板：创建 / 查看内容 / 看差异 / 快速恢复 / 删除（仅初始管理员可见，服务端另有权威校验）
//
// 设计取舍：
//   · 列表只拉元数据（不含文件清单），点开某一份才按需拉详情 —— 528 个文件的 manifest
//     有几十 KB，一次性全拉会让这个面板在慢网络下明显卡顿。
//   · 「看差异」用相邻两份比较（最新 vs 次新）为主入口，同时支持任选两份：
//     需求是"能看到备份之间的区别"，最常见的问题就是"上次那批改动到底改了什么"。
//   · 恢复是破坏性动作，所以：二次确认 + 服务端要求回填 id + 恢复前自动再备一份。
import {
  AlertTriangle, ArrowLeftRight, Check, ChevronDown, ChevronRight,
  Database, Download, HardDriveDownload, Loader2, RotateCcw, Trash2
} from 'lucide-vue-next'

interface BackupFileEntry { path: string; size: number; sha256: string }
interface BackupMeta {
  v: number
  id: string
  createdAt: string
  kind: 'manual' | 'pre-restore' | 'pre-audit'
  reason: string
  actor: string
  fileCount: number
  totalBytes: number
  archiveBytes: number
  noteCount: number
  files: BackupFileEntry[]
  complete: boolean
}
interface StorageInfo {
  dir: string
  persistent: boolean
  usedBytes: number
  count: number
  keep: number
}
interface DiffResult {
  from: { id: string; createdAt: string; kind: string }
  to: { id: string; createdAt: string; kind: string }
  diff: { added: string[]; removed: string[]; changed: string[]; unchanged: number }
}

const requestFetch = useRequestFetch()
const toast = useToast()
const { confirm } = useConfirm()

const items = ref<BackupMeta[]>([])
const storage = ref<StorageInfo | null>(null)
const loading = ref(false)
const creating = ref(false)
const busyId = ref('')

/** 展开的详情（id → 完整 meta） */
const detail = ref<Record<string, BackupMeta>>({})
const expanded = ref<Set<string>>(new Set())

/** 差异对比 */
const diff = ref<DiffResult | null>(null)
const diffLoading = ref(false)
const diffFrom = ref('')
const diffTo = ref('')

const fmtBytes = (n: number) => {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`
}

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const kindLabel = (k: string) =>
  k === 'pre-restore' ? '恢复前自动' : k === 'pre-audit' ? 'AI 执行前自动' : '手动'

const kindClass = (k: string) =>
  k === 'manual'
    ? 'border-line text-ink-3'
    : 'border-accent/40 text-accent bg-[var(--accent-soft)]'

const load = async () => {
  loading.value = true
  try {
    const res = await requestFetch<{ items: BackupMeta[]; storage: StorageInfo }>('/api/admin/backups')
    items.value = res.items || []
    storage.value = res.storage || null
  } catch (e: any) {
    toast.error(e?.data?.message || '读取备份清单失败')
  } finally {
    loading.value = false
  }
}

const create = async () => {
  creating.value = true
  try {
    const res = await requestFetch<{ meta: BackupMeta }>('/api/admin/backups', {
      method: 'POST',
      body: { reason: '手动备份' }
    })
    toast.success(`已备份 ${res.meta.fileCount} 个文件（${fmtBytes(res.meta.archiveBytes)}）`)
    await load()
  } catch (e: any) {
    toast.error(e?.data?.message || '备份失败')
  } finally {
    creating.value = false
  }
}

const toggle = async (m: BackupMeta) => {
  const next = new Set(expanded.value)
  if (next.has(m.id)) {
    next.delete(m.id)
    expanded.value = next
    return
  }
  next.add(m.id)
  expanded.value = next
  if (!detail.value[m.id]) {
    try {
      const res = await requestFetch<{ meta: BackupMeta }>(`/api/admin/backups/${encodeURIComponent(m.id)}`)
      detail.value = { ...detail.value, [m.id]: res.meta }
    } catch (e: any) {
      toast.error(e?.data?.message || '读取备份详情失败')
    }
  }
}

/** 与「下一份更新的备份」比较；最旧的那份则与它自己更早的比不了，改与最新比 */
const compareWithNeighbor = async (m: BackupMeta) => {
  const idx = items.value.findIndex(x => x.id === m.id)
  const other = items.value[idx - 1] || items.value[idx + 1]
  if (!other) { toast.warn('至少要有两份备份才能比较'); return }
  // 时间上早的作 from，晚的作 to —— 这样「新增/删除」的方向符合直觉
  const [from, to] = new Date(m.createdAt) < new Date(other.createdAt) ? [m, other] : [other, m]
  await runDiff(from.id, to.id)
}

const runDiff = async (from: string, to: string) => {
  if (!from || !to) { toast.warn('请选择两份备份'); return }
  if (from === to) { toast.warn('请选择两份不同的备份'); return }
  diffLoading.value = true
  diff.value = null
  try {
    // 存**整个响应**（含 from/to 两端身份），模板要用 `diff.from.createdAt` 标注「哪两份」。
    // 只存 diff 本体会让模板里的 diff.from 变成 undefined，整个差异卡渲染失败。
    diff.value = await requestFetch<DiffResult>(
      `/api/admin/backups/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    )
  } catch (e: any) {
    toast.error(e?.data?.message || '比较失败')
  } finally {
    diffLoading.value = false
  }
}

const restore = async (m: BackupMeta) => {
  const ok = await confirm({
    title: '恢复到这份备份？',
    message: `当前知识库会被**替换**成 ${fmtTime(m.createdAt)} 的状态（${m.fileCount} 个文件）。恢复前会自动再备份一份当前状态，出问题可以再恢复回来。`,
    detail: `${m.id}\n${m.reason || '（无备注）'}`,
    confirmText: '恢复',
    danger: true
  })
  if (!ok) return
  busyId.value = m.id
  try {
    const res = await requestFetch<{
      restored: string
      safetyBackupId: string
      fileCount: number
      noteCount: number
      reindexed: number
    }>(`/api/admin/backups/${encodeURIComponent(m.id)}/restore`, {
      method: 'POST',
      body: { confirm: m.id }
    })
    toast.success(`已恢复 ${res.fileCount} 个文件、重建索引 ${res.reindexed} 篇（恢复前的状态已存为 ${res.safetyBackupId}）`)
    await load()
    // 恢复后数据整体变了，让页面上的其它面板重新取数
    await refreshNuxtData()
  } catch (e: any) {
    toast.error(e?.data?.message || '恢复失败')
  } finally {
    busyId.value = ''
  }
}

const remove = async (m: BackupMeta) => {
  const ok = await confirm({
    title: '删除这份备份？',
    message: '只删除备份文件本身，不影响知识库当前内容。',
    detail: `${m.id} · ${fmtTime(m.createdAt)}`,
    confirmText: '删除',
    danger: true
  })
  if (!ok) return
  busyId.value = m.id
  try {
    await requestFetch(`/api/admin/backups/${encodeURIComponent(m.id)}`, { method: 'DELETE' })
    toast.success('已删除')
    await load()
  } catch (e: any) {
    toast.error(e?.data?.message || '删除失败')
  } finally {
    busyId.value = ''
  }
}

onMounted(load)
</script>

<template>
  <section class="mb-6 rounded-card border border-line bg-surface p-5" data-testid="backup-panel">
    <h2 class="text-ds-lg font-semibold text-ink mb-1 flex items-center gap-2">
      <Database class="w-4 h-4 text-accent" />库备份与恢复
    </h2>
    <p class="text-[12px] text-ink-3 mb-4">
      备份包含 vault 里全部 <code>.md</code> 文件，以及**不在文件里**的元数据（手工指定的领域、成熟度、图谱配色、AI 设置）。
      只留最近 {{ storage?.keep ?? 10 }} 份，创建新备份后自动清理更旧的。
    </p>

    <!-- 存储状态 -->
    <div class="rounded-card border border-line bg-surface-2 p-4 mb-4">
      <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p class="text-[12px] text-ink-3 mb-1">已用 / 份数</p>
          <p class="text-ds-sm text-ink-2 font-mono">
            {{ fmtBytes(storage?.usedBytes || 0) }} · {{ storage?.count || 0 }} / {{ storage?.keep || 10 }}
          </p>
        </div>
        <div class="min-w-0">
          <p class="text-[12px] text-ink-3 mb-1">存放位置</p>
          <p class="text-ds-sm text-ink-2 font-mono break-all">{{ storage?.dir || '—' }}</p>
        </div>
      </div>
      <p
        v-if="storage && !storage.persistent"
        class="mt-3 flex items-start gap-1.5 text-[12px] text-growing"
      >
        <AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
        当前备份目录在容器内部，<b>容器重建就会丢</b>。生产环境请给它挂载宿主持久目录（见 deploy/docker-compose.prod.yml）。
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2 mb-4">
      <button
        class="px-4 py-2 rounded-ctl text-ds-sm font-semibold bg-accent text-[var(--accent-ink)] inline-flex items-center gap-1.5 transition-opacity duration-micro disabled:opacity-45"
        :disabled="creating"
        data-testid="backup-create"
        @click="create"
      >
        <HardDriveDownload class="w-3.5 h-3.5" />{{ creating ? '备份中…' : '立即备份' }}
      </button>
      <button
        class="px-3 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro inline-flex items-center gap-1.5 disabled:opacity-45"
        :disabled="loading"
        @click="load"
      >
        <Loader2 v-if="loading" class="w-3.5 h-3.5 animate-spin" /><RotateCcw v-else class="w-3.5 h-3.5" />刷新
      </button>
    </div>

    <!-- 任意两份比较 -->
    <div class="flex flex-wrap items-end gap-2 mb-3">
      <label class="text-[12px] text-ink-3">
        <span class="block mb-1">对比（早 → 晚）</span>
        <AppSelect v-model="diffFrom" size="sm" class="w-[210px]" :options="[{ value: '', label: '选择较早的备份' }, ...items.map(i => ({ value: i.id, label: fmtTime(i.createdAt) }))]" />
      </label>
      <ArrowLeftRight class="w-3.5 h-3.5 text-ink-3 mb-2" />
      <label class="text-[12px] text-ink-3">
        <span class="block mb-1">目标</span>
        <AppSelect v-model="diffTo" size="sm" class="w-[210px]" :options="[{ value: '', label: '选择较晚的备份' }, ...items.map(i => ({ value: i.id, label: fmtTime(i.createdAt) }))]" />
      </label>
      <button
        class="px-3 py-2 rounded-ctl text-ds-sm border border-line bg-surface text-ink-2 hover:bg-surface-3 transition-colors duration-micro disabled:opacity-45"
        :disabled="diffLoading || !diffFrom || !diffTo"
        @click="runDiff(diffFrom, diffTo)"
      >{{ diffLoading ? '比较中…' : '比较差异' }}</button>
    </div>

    <!-- 差异结果 -->
    <div v-if="diff" class="mb-4 rounded-card border border-line bg-surface-2 p-3" data-testid="backup-diff">
      <p class="text-ds-sm text-ink-2 mb-2">
        {{ fmtTime(diff.from.createdAt) }} → {{ fmtTime(diff.to.createdAt) }}：
        新增 <b class="text-evergreen">{{ diff.diff.added.length }}</b>、
        删除 <b class="text-danger">{{ diff.diff.removed.length }}</b>、
        修改 <b class="text-growing">{{ diff.diff.changed.length }}</b>、
        未变 {{ diff.diff.unchanged }}
      </p>
      <div class="space-y-1 max-h-[220px] overflow-y-auto">
        <p v-for="p in diff.diff.added" :key="`a-${p}`" class="text-[12px] font-mono text-evergreen break-all">+ {{ p }}</p>
        <p v-for="p in diff.diff.removed" :key="`d-${p}`" class="text-[12px] font-mono text-danger break-all">− {{ p }}</p>
        <p v-for="p in diff.diff.changed" :key="`c-${p}`" class="text-[12px] font-mono text-growing break-all">~ {{ p }}</p>
        <p v-if="!diff.diff.added.length && !diff.diff.removed.length && !diff.diff.changed.length" class="text-[12px] text-ink-3">
          两份备份的文件内容完全一致。
        </p>
      </div>
    </div>

    <!-- 清单 -->
    <p v-if="!items.length && !loading" class="text-ds-sm text-ink-3 py-4">
      还没有备份。第一次点「立即备份」会生成一份当前状态的完整快照。
    </p>

    <div v-else class="space-y-2">
      <div
        v-for="m in items"
        :key="m.id"
        class="rounded-card border border-line bg-surface-2 overflow-hidden"
        :data-testid="`backup-row-${m.id}`"
      >
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
          <button
            class="flex items-center gap-1.5 text-left min-w-0 flex-1"
            @click="toggle(m)"
          >
            <component :is="expanded.has(m.id) ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 text-ink-3 shrink-0" />
            <span class="text-ds-sm text-ink font-medium tabular-nums">{{ fmtTime(m.createdAt) }}</span>
            <span class="text-[11px] px-1.5 py-0.5 rounded-full border" :class="kindClass(m.kind)">{{ kindLabel(m.kind) }}</span>
            <span v-if="!m.complete" class="text-[11px] px-1.5 py-0.5 rounded-full border border-danger/50 text-danger">未完成</span>
          </button>

          <span class="text-[12px] text-ink-3 font-mono shrink-0">
            {{ m.fileCount }} 文件 · {{ fmtBytes(m.archiveBytes) }}
          </span>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              class="px-2.5 py-1.5 rounded-ctl text-[12px] border border-line text-ink-2 hover:bg-surface-3 transition-colors duration-micro disabled:opacity-45"
              :disabled="busyId === m.id || !m.complete"
              @click="compareWithNeighbor(m)"
            >看差异</button>
            <button
              class="px-2.5 py-1.5 rounded-ctl text-[12px] border border-accent/40 text-accent hover:bg-[var(--accent-soft)] transition-colors duration-micro disabled:opacity-45 inline-flex items-center gap-1"
              :disabled="busyId === m.id || !m.complete"
              @click="restore(m)"
            >
              <RotateCcw v-if="busyId !== m.id" class="w-3 h-3" /><Loader2 v-else class="w-3 h-3 animate-spin" />恢复
            </button>
            <button
              class="px-2 py-1.5 rounded-ctl text-[12px] border border-danger/40 text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] transition-colors duration-micro disabled:opacity-45"
              :disabled="busyId === m.id"
              title="删除这份备份"
              @click="remove(m)"
            ><Trash2 class="w-3 h-3" /></button>
          </div>
        </div>

        <p v-if="m.reason" class="px-3 pb-2 -mt-0.5 text-[12px] text-ink-3">{{ m.reason }}<span v-if="m.actor"> · {{ m.actor }}</span></p>

        <!-- 展开：文件清单 -->
        <div v-if="expanded.has(m.id)" class="border-t border-line bg-surface px-3 py-2.5">
          <div class="flex flex-wrap items-center gap-x-6 gap-y-1 mb-2 text-[12px] text-ink-3">
            <span class="inline-flex items-center gap-1"><Download class="w-3 h-3" />归档 {{ fmtBytes(m.archiveBytes) }}（未压缩 {{ fmtBytes(m.totalBytes) }}）</span>
            <span>笔记元数据 {{ m.noteCount }} 条</span>
            <span class="font-mono">{{ m.id }}</span>
          </div>
          <div v-if="!detail[m.id]" class="text-[12px] text-ink-3 py-2 inline-flex items-center gap-1.5">
            <Loader2 class="w-3 h-3 animate-spin" />读取文件清单…
          </div>
          <div v-else class="max-h-[260px] overflow-y-auto space-y-0.5">
            <p
              v-for="f in (detail[m.id]?.files || [])"
              :key="f.path"
              class="text-[12px] font-mono text-ink-2 flex items-baseline gap-2"
            >
              <span class="flex-1 min-w-0 break-all">{{ f.path }}</span>
              <span class="text-ink-3 shrink-0 tabular-nums">{{ fmtBytes(f.size) }}</span>
              <span class="text-ink-3 shrink-0" :title="f.sha256">{{ f.sha256.slice(0, 7) }}</span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <p class="mt-3 text-[12px] text-ink-3 flex items-start gap-1.5">
      <Check class="w-3.5 h-3.5 shrink-0 mt-0.5" />
      恢复前会<b>自动</b>把当前状态再备一份（标记「恢复前自动」），恢复错了还能再恢复回来。
    </p>
  </section>
</template>
