/**
 * 知识库备份 / 恢复 —— 只有初始管理员可调用（见 server/utils/auth.ts 的 requireBuiltinAdmin）。
 *
 * ## 为什么备份要同时包含「文件」和「数据库元数据」
 *
 * vault 里的 .md 是笔记正文与标签的事实源，但**不是全部事实**：
 * `Note.domainLevel1` / `domainSource` 是「人工指定领域」的唯一落点，它**不写 frontmatter**
 * （见 server/utils/suggest.ts 顶部注释）。只备份文件的话，恢复后所有手工指定的领域都会退回
 * 路径派生 —— 这正是「备份看起来成功了、实际丢了东西」的典型场景。所以每次备份都带一份
 * 元数据快照（不含正文：正文在文件里，重复存会让备份大一倍）。
 *
 * ## 为什么不用 tar / zip
 *
 * ① 本地开发时 `content/vault` 是 Windows Junction（指向 E:\Vault），系统 `tar` **不跟随**
 *    junction，会打出一个空包 —— 备份"成功"但里面什么都没有。这种静默失败必须避免。
 * ② 恢复时若先把整库读进内存再解析，33MB 正文会膨胀到 150MB+，而生产容器限 640M、
 *    Node 堆限 384M，正好卡在 OOM 边缘。
 *
 * 于是用一个极简的自描述容器（`.gmz` = garden markdown archive），gzip 流里顺序放
 * `[pathLen][path][size][bytes]` 记录。写与读都是流式，内存只跟**单个文件**大小有关，
 * 且不依赖任何外部命令 —— Windows 与 Linux 行为一致。
 *
 * ## 保留策略
 *
 * 只留最近 10 份（需求）。轮转在**创建成功后**执行，且永远保留「刚刚创建的那份」，
 * 避免磁盘满时把唯一可用的备份也删掉。
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { prisma } from './db'
import { VAULT_DIR } from './vault'
import { beginVaultBusy, endVaultBusy } from './vault-busy'

/** 备份根目录。生产由 compose 挂载到宿主持久目录；未挂载时退化为容器内目录（重启会丢） */
export const BACKUP_DIR = process.env.GARDEN_BACKUP_DIR
  ? path.resolve(process.env.GARDEN_BACKUP_DIR)
  : path.join(process.cwd(), 'data', 'backups')

/** 保留份数（需求：保留 10 个） */
export const KEEP_BACKUPS = 10

const ARCHIVE = 'vault.gmz'
const META = 'meta.json'
const DB_SNAP = 'db.json'
const MAGIC = 'GMZ1'

export type BackupKind = 'manual' | 'pre-restore' | 'pre-audit'

export interface BackupFileEntry {
  /** vault 相对路径（正斜杠） */
  path: string
  size: number
  sha256: string
}

export interface BackupMeta {
  v: 1
  id: string
  createdAt: string
  kind: BackupKind
  /** 人话原因（谁在做什么之前备的） */
  reason: string
  /** 触发者标签（密钥 label，不是密钥本身） */
  actor: string
  fileCount: number
  totalBytes: number
  /** 归档文件本身的字节数（用于展示"占了多少磁盘"） */
  archiveBytes: number
  /** 元数据快照里的笔记数 */
  noteCount: number
  /** 每个文件的大小与哈希 —— 「看内容」与「看差异」都靠它，不必解压归档 */
  files: BackupFileEntry[]
  /** 是否已完成（写入中途失败会留下 false 的残骸，列表里要能看出来） */
  complete: boolean
}

// ── 容器格式：写 ────────────────────────────────────────────────────────────

function u32(n: number): Buffer {
  const b = Buffer.allocUnsafe(4)
  b.writeUInt32BE(n >>> 0, 0)
  return b
}

/** 递归列出 vault 下的普通文件（跳过以 . 开头的目录/文件，与 watcher 的 ignored 规则一致） */
export async function listVaultFiles(root = VAULT_DIR): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string, rel: string) => {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const full = path.join(dir, e.name)
      const next = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(full, next)
      else if (e.isFile()) out.push(next)
    }
  }
  await walk(root, '')
  out.sort()
  return out
}

/**
 * 把 vault 写成 .gmz 归档，同时返回 manifest。
 * 逐文件流式写入：峰值内存 = 单个文件大小。
 */
async function writeArchive(
  outFile: string,
  files: string[]
): Promise<{ manifest: BackupFileEntry[]; totalBytes: number }> {
  const manifest: BackupFileEntry[] = []
  let totalBytes = 0

  async function* records(): AsyncGenerator<Buffer> {
    yield Buffer.from(MAGIC, 'utf8')
    for (const rel of files) {
      const full = path.join(VAULT_DIR, rel)
      let buf: Buffer
      try {
        buf = await fs.readFile(full)
      } catch {
        // 备份期间文件被删（watcher/用户在编辑）—— 跳过，不编造内容
        continue
      }
      const sha256 = createHash('sha256').update(buf).digest('hex')
      manifest.push({ path: rel, size: buf.byteLength, sha256 })
      totalBytes += buf.byteLength
      const p = Buffer.from(rel, 'utf8')
      yield u32(p.byteLength)
      yield p
      yield u32(buf.byteLength)
      yield buf
    }
  }

  await pipeline(
    Readable.from(records()),
    createGzip({ level: 6 }),
    createWriteStream(outFile)
  )
  return { manifest, totalBytes }
}

/**
 * 流式读归档，逐条回调。内存恒定。
 * 返回读到的条目数，供调用方与 manifest 对账（不一致就是归档损坏）。
 */
export async function readArchive(
  file: string,
  onEntry: (rel: string, buf: Buffer) => Promise<void> | void
): Promise<number> {
  let state: 'magic' | 'pathLen' | 'path' | 'size' | 'data' = 'magic'
  let pending: Buffer = Buffer.alloc(0)
  let pathLen = 0
  let size = 0
  let rel = ''
  let count = 0
  let magicChecked = false

  const take = (n: number): Buffer | null => {
    if (pending.byteLength < n) return null
    const out = pending.subarray(0, n)
    pending = pending.subarray(n)
    return out
  }

  const consume = async (): Promise<void> => {
    for (;;) {
      if (state === 'magic') {
        const b = take(4)
        if (!b) return
        if (b.toString('utf8') !== MAGIC) throw new Error('备份归档格式不识别（magic 不匹配）')
        magicChecked = true
        state = 'pathLen'
        continue
      }
      if (state === 'pathLen') {
        const b = take(4)
        if (!b) return
        pathLen = b.readUInt32BE(0)
        if (pathLen === 0 || pathLen > 8192) throw new Error('备份归档损坏（路径长度异常）')
        state = 'path'
        continue
      }
      if (state === 'path') {
        const b = take(pathLen)
        if (!b) return
        rel = b.toString('utf8')
        state = 'size'
        continue
      }
      if (state === 'size') {
        const b = take(4)
        if (!b) return
        size = b.readUInt32BE(0)
        if (size > 64 * 1024 * 1024) throw new Error(`备份归档损坏（${rel} 体积异常）`)
        state = 'data'
        continue
      }
      // data
      const b = take(size)
      if (!b) return
      await onEntry(rel, Buffer.from(b))
      count++
      state = 'pathLen'
    }
  }

  const gunzip = createGunzip()
  const stream = createReadStream(file).pipe(gunzip)
  for await (const chunk of stream) {
    pending = pending.byteLength ? Buffer.concat([pending, chunk as Buffer]) : (chunk as Buffer)
    await consume()
  }
  // 收尾：正常的归档在读完最后一个文件后 state 应为 pathLen（等待下一条），pending 应为空。
  // 必须 cast：state 只在闭包 consume() 里被改写，而 TS 的控制流分析不会把闭包内的赋值
  // 算进来，于是外层仍认为它是初始的 'magic'，直接比较会报「类型无交集」。
  const finalState = state as 'magic' | 'pathLen' | 'path' | 'size' | 'data'
  await consume()
  if (!magicChecked) throw new Error('备份归档为空或不完整')
  if (finalState !== 'pathLen' || pending.byteLength > 0) {
    throw new Error('备份归档被截断（末尾数据不完整）')
  }
  return count
}

// ── 数据库元数据快照 ────────────────────────────────────────────────────────

interface DbSnapshot {
  v: 1
  notes: Array<{
    slug: string
    title: string
    maturity: string
    isPublished: boolean
    domainLevel1: string | null
    domainSource: string
    createdAt: string
    /**
     * 原始修改时间。必须一起存回来：恢复后 `processMarkdownFile` 把文件重跑一遍，
     * 行是新建的，`createdAt` 会变成恢复当天 —— 笔记的「创建于」会永久失真，
     * 而更新时间还会被「最近更新」排序、watcher 的建议时间窗读到。
     */
    updatedAt: string
    metadata: unknown
    /** 标签按名字存：恢复后 Note.id 会变，用 id 关联必然错位 */
    tags: string[]
  }>
  graphColors: Array<{ keyId: string; slug: string; color: string }>
  appSettings: Array<{ key: string; value: unknown }>
}

async function dumpDb(): Promise<DbSnapshot> {
  const notes = await prisma.note.findMany({
    select: {
      slug: true,
      title: true,
      maturity: true,
      isPublished: true,
      domainLevel1: true,
      domainSource: true,
      createdAt: true,
      updatedAt: true,
      metadata: true,
      tags: { select: { tag: { select: { name: true } } } }
    }
  })
  const graphColors = await prisma.graphColor.findMany({ select: { keyId: true, slug: true, color: true } })
  const appSettings = await prisma.appSetting.findMany({ select: { key: true, value: true } })
  return {
    v: 1,
    notes: notes.map(n => ({
      slug: n.slug,
      title: n.title,
      maturity: n.maturity as unknown as string,
      isPublished: n.isPublished,
      domainLevel1: n.domainLevel1,
      domainSource: n.domainSource,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      metadata: n.metadata,
      tags: n.tags.map(t => t.tag.name).filter(Boolean)
    })),
    graphColors,
    appSettings
  }
}

// ── 对外：创建 / 列表 / 详情 / 差异 / 恢复 / 轮转 ───────────────────────────

function newId(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`
}

async function backupDir(id: string): Promise<string> {
  // id 只允许安全字符，避免 `../` 之类穿越到备份根之外
  if (!/^[0-9]{8}-[0-9]{6}-[a-z0-9]{2,8}$/.test(id)) {
    throw new Error('备份 ID 非法')
  }
  return path.join(BACKUP_DIR, id)
}

/** 创建一份备份 */
export async function createBackup(opts: {
  kind?: BackupKind
  reason?: string
  actor?: string
} = {}): Promise<BackupMeta> {
  const id = newId()
  const dir = path.join(BACKUP_DIR, id)
  await fs.mkdir(dir, { recursive: true })

  const meta: BackupMeta = {
    v: 1,
    id,
    createdAt: new Date().toISOString(),
    kind: opts.kind || 'manual',
    reason: (opts.reason || '').slice(0, 200),
    actor: (opts.actor || '').slice(0, 80),
    fileCount: 0,
    totalBytes: 0,
    archiveBytes: 0,
    noteCount: 0,
    files: [],
    complete: false
  }

  // 先落一份"未完成"的元数据：万一进程在打包中途被杀，列表里能看到这个残骸，
  // 而不是出现一个"目录存在但没有元数据"的幽灵条目。
  await fs.writeFile(path.join(dir, META), JSON.stringify(meta, null, 2), 'utf8')

  const files = await listVaultFiles()
  const { manifest, totalBytes } = await writeArchive(path.join(dir, ARCHIVE), files)
  const db = await dumpDb()
  await fs.writeFile(path.join(dir, DB_SNAP), JSON.stringify(db), 'utf8')

  const stat = await fs.stat(path.join(dir, ARCHIVE))
  meta.files = manifest
  meta.fileCount = manifest.length
  meta.totalBytes = totalBytes
  meta.archiveBytes = stat.size
  meta.noteCount = db.notes.length
  meta.complete = true
  await fs.writeFile(path.join(dir, META), JSON.stringify(meta, null, 2), 'utf8')

  await pruneBackups()
  return meta
}

/** 列出全部备份（新→旧）。损坏/未完成的也会列出，但 complete=false */
export async function listBackups(): Promise<BackupMeta[]> {
  let names: string[]
  try {
    names = await fs.readdir(BACKUP_DIR)
  } catch {
    return []
  }
  const out: BackupMeta[] = []
  for (const name of names) {
    if (!/^[0-9]{8}-[0-9]{6}-[a-z0-9]{2,8}$/.test(name)) continue
    try {
      const raw = await fs.readFile(path.join(BACKUP_DIR, name, META), 'utf8')
      const meta = JSON.parse(raw) as BackupMeta
      out.push(meta)
    } catch {
      // 元数据损坏：仍以最小信息占位，避免它"消失"后用户以为备份被删了
      out.push({
        v: 1,
        id: name,
        createdAt: name.slice(0, 4) + '-' + name.slice(4, 6) + '-' + name.slice(6, 8) + 'T' +
          name.slice(9, 11) + ':' + name.slice(11, 13) + ':' + name.slice(13, 15) + 'Z',
        kind: 'manual',
        reason: '（元数据损坏，无法读取详情）',
        actor: '',
        fileCount: 0,
        totalBytes: 0,
        archiveBytes: 0,
        noteCount: 0,
        files: [],
        complete: false
      })
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getBackup(id: string): Promise<BackupMeta | null> {
  try {
    const dir = await backupDir(id)
    return JSON.parse(await fs.readFile(path.join(dir, META), 'utf8')) as BackupMeta
  } catch {
    return null
  }
}

export interface BackupDiff {
  added: string[]
  removed: string[]
  changed: string[]
  unchanged: number
}

/** 两份备份之间「哪些文件新增/删除/修改了」。按 path→sha256 比对，不解压 */
export function diffBackups(from: BackupMeta, to: BackupMeta): BackupDiff {
  const a = new Map(from.files.map(f => [f.path, f.sha256]))
  const b = new Map(to.files.map(f => [f.path, f.sha256]))
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  let unchanged = 0
  for (const [p, h] of b) {
    if (!a.has(p)) added.push(p)
    else if (a.get(p) !== h) changed.push(p)
    else unchanged++
  }
  for (const p of a.keys()) if (!b.has(p)) removed.push(p)
  added.sort(); removed.sort(); changed.sort()
  return { added, removed, changed, unchanged }
}

/**
 * 恢复到某份备份。
 *
 * 顺序刻意如此：
 *   1) 先给**当前状态**备一份（pre-restore）—— 恢复本身是破坏性动作，必须留退路；
 *   2) 解压到临时目录并校验条目数，确认归档完整后再动真库（避免"解压到一半发现损坏"）；
 *   3) 清空 vault 里的非隐藏文件，再从临时目录复制回去；
 *   4) 回灌元数据（领域、成熟度等 frontmatter 里没有的东西）；
 *   5) 逐个 processMarkdownFile 重建索引（不等 watcher：它的 usePolling 在恢复后要等好几秒）；
 *   6) 把备份里记录的 createdAt / updatedAt 写回 —— 第 5 步会重建行，不写回的话
 *      全库的「创建于」都会变成恢复当天（实测过一次，524 篇全被刷成同一时刻）。
 *
 * 全程被 `beginVaultBusy` 包住：watcher 在窗口内丢弃全部 add/change/unlink 事件。
 * 不包的话，第 3 步清空 vault 会触发 524 个 unlink → `removeMarkdownFile` 把整库 Note 行删光，
 * 第 4/5 步再重建，等于自己制造了一次「全库删除 + 全库重建」。
 */
export async function restoreBackup(id: string, actor: string): Promise<{
  restored: string
  safetyBackupId: string
  fileCount: number
  noteCount: number
  reindexed: number
}> {
  const meta = await getBackup(id)
  if (!meta) throw new Error('备份不存在')
  if (!meta.complete) throw new Error('这份备份没有写完（complete=false），不能用来恢复')
  const dir = await backupDir(id)
  const archive = path.join(dir, ARCHIVE)
  await fs.access(archive).catch(() => { throw new Error('备份归档文件缺失') })

  // 1) 退路
  const safety = await createBackup({
    kind: 'pre-restore',
    reason: `恢复到 ${id} 之前的自动备份`,
    actor
  })

  // 2) 解压到临时目录并校验
  //    解压本身不动 vault，但紧接着的第 3 步会清空它 —— 标记提前到这里，
  //    避免「解压刚完、标记还没设」的那一瞬间漏进事件。
  beginVaultBusy(180_000, `恢复备份 ${id}`)
  const tmp = path.join(BACKUP_DIR, `.restore-${Date.now()}`)
  await fs.mkdir(tmp, { recursive: true })
  try {
    let written = 0
    await readArchive(archive, async (rel, buf) => {
      const full = path.join(tmp, rel)
      // 归档里的路径同样要防穿越（备份可能来自更早的版本/被人工篡改）
      const norm = path.normalize(full)
      if (!norm.startsWith(tmp + path.sep)) throw new Error(`归档含非法路径：${rel}`)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, buf)
      written++
    })
    if (written !== meta.fileCount) {
      throw new Error(`归档条目数（${written}）与备份记录（${meta.fileCount}）不一致，已中止，库未改动`)
    }

    // 3) 清空 vault（保留以 . 开头的目录，如 .obsidian —— 那是用户的本机配置，不属于库内容）
    const entries = await fs.readdir(VAULT_DIR, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      await fs.rm(path.join(VAULT_DIR, e.name), { recursive: true, force: true })
    }
    const files = await listVaultFiles(tmp)
    for (const rel of files) {
      const dst = path.join(VAULT_DIR, rel)
      await fs.mkdir(path.dirname(dst), { recursive: true })
      await fs.copyFile(path.join(tmp, rel), dst)
    }

    // 4) 回灌元数据
    const dbRaw = await fs.readFile(path.join(dir, DB_SNAP), 'utf8').catch(() => null)
    let noteCount = 0
    if (dbRaw) {
      const snap = JSON.parse(dbRaw) as DbSnapshot
      noteCount = snap.notes.length
      for (const n of snap.notes) {
        await prisma.note.updateMany({
          where: { slug: n.slug },
          data: {
            maturity: n.maturity as never,
            isPublished: n.isPublished,
            domainLevel1: n.domainLevel1,
            domainSource: n.domainSource
          }
        }).catch(() => null)
      }
    }

    // 5) 重建索引
    const { processMarkdownFile } = await import('./markdown')
    let reindexed = 0
    for (const rel of files) {
      if (!rel.toLowerCase().endsWith('.md')) continue
      const ok = await processMarkdownFile(path.join(VAULT_DIR, rel)).catch(() => false)
      if (ok) reindexed++
    }

    // 6) 时间戳写回 —— 必须放在重建索引之后
    //    processMarkdownFile 里 `contentChanged` 才更新 updatedAt，但行本身是 upsert 出来的，
    //    createdAt 一律是「现在」。不写回的话，用户会看到整库笔记的创建时间都变成恢复当天，
    //    「最近更新」排序也全乱（实测：524 篇全被刷成同一秒）。
    //    用原始 SQL 是因为 Prisma 的 update 会强行把 updatedAt 设为 now()。
    if (dbRaw) {
      const snap = JSON.parse(dbRaw) as DbSnapshot
      for (const n of snap.notes) {
        await prisma.$executeRawUnsafe(
          'UPDATE "Note" SET "createdAt" = $1::timestamptz, "updatedAt" = $2::timestamptz WHERE "slug" = $3',
          n.createdAt,
          n.updatedAt || n.createdAt,
          n.slug
        ).catch(() => null)
      }
    }

    const { invalidateGardenCache } = await import('./cache')
    invalidateGardenCache()

    return {
      restored: id,
      safetyBackupId: safety.id,
      fileCount: files.length,
      noteCount,
      reindexed
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => null)
    // 宽限期 5 秒：chokidar 的 awaitWriteFinish 稳定窗口是 1 秒，
    // 事件到达晚于文件写完，立刻解除会让最后一批事件照样漏进来。
    endVaultBusy(5_000)
  }
}

/** 删除一份备份（用户可以手动清理，不受保留份数限制） */
export async function deleteBackup(id: string): Promise<void> {
  const dir = await backupDir(id)
  await fs.rm(dir, { recursive: true, force: true })
}

/** 轮转：只保留最近 KEEP_BACKUPS 份 */
export async function pruneBackups(keep = KEEP_BACKUPS): Promise<string[]> {
  const all = await listBackups()
  const removed: string[] = []
  for (const meta of all.slice(keep)) {
    try {
      await deleteBackup(meta.id)
      removed.push(meta.id)
    } catch {
      // 删不掉（权限/占用）就留着，不影响本次备份成功
    }
  }
  return removed
}

/** 备份根目录是否真的持久化（生产未挂载时给界面一个明确警告） */
export async function backupStorageInfo(): Promise<{
  dir: string
  persistent: boolean
  usedBytes: number
  count: number
  keep: number
}> {
  const all = await listBackups()
  const usedBytes = all.reduce((a, m) => a + m.archiveBytes, 0)
  return {
    dir: BACKUP_DIR,
    // 生产里容器内路径 /app/data/backups 只有在 compose 挂了卷才是持久的
    persistent: !process.env.NODE_ENV || process.env.NODE_ENV !== 'production' || !!process.env.GARDEN_BACKUP_DIR,
    usedBytes,
    count: all.length,
    keep: KEEP_BACKUPS
  }
}
