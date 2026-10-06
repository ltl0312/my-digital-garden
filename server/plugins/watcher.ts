import chokidar from 'chokidar'
import path from 'path'
import fs from 'fs/promises'
import { defineNitroPlugin } from '#imports'
import { processMarkdownFile, removeMarkdownFile } from '../utils/markdown'
import { recomputeAllMaturity } from '../utils/maturity-sync'
import { isRecentlyIngested } from '../utils/import-job'
import { autoSuggestRecent } from '../utils/suggest'
import { prisma } from '../utils/db'

export default defineNitroPlugin((nitroApp) => {
  // PM2 cluster 多实例下仅主实例（NODE_APP_INSTANCE=0）启动 watcher：
  // 否则每个 worker 独立监听同一 vault，同一文件被并发解析入库（行锁竞争 / P2028）
  const instance = process.env.NODE_APP_INSTANCE
  if (instance !== undefined && instance !== '0') {
    console.log(`[garden] watcher: 非主实例（#${instance}），跳过文件监听`)
    return
  }

  const vaultPath = path.resolve(process.cwd(), 'content/vault')

  console.log(`[garden] watcher: 开始监听 ${vaultPath}`)

  // 串行处理队列：全量同步/批量事件并发会压垮连接池导致 P2028 事务启动超时
  let queue: Promise<void> = Promise.resolve()
  const enqueue = (fn: () => Promise<void>) => {
    queue = queue.then(fn).catch((e) => console.error('[garden] watcher: 队列任务失败', e))
    return queue
  }

  // ── 启动 / 周期性对账：把「磁盘有、DB 没有」的笔记补入库 ──────────────────
  // 为什么需要：生产用 ignoreInitial: true（重启不重同步，避免把 updatedAt 刷成当天），
  // 于是任何「watcher 没看见的写入」都会永久缺席 DB —— 例如入库时抛错的文件
  // （线上真实案例：标题「111」被 YAML 解析成 int，Prisma 抛
  // Argument `title`: Expected String, provided Int. → 只 log 一次、不重试），
  // 或者恰好在容器重启窗口里落盘的文件。这些文件在结构树（按文件系统构建）里看得见，
  // 点开却是 404 → 详情页 createError → 一片空白。
  // 只补不删：vault 挂载异常时删行会把整库清空，宁可留下孤儿行（删除仍由 unlink 事件负责）。
  const listVaultMarkdown = async (root: string) => {
    const out: { slug: string; filePath: string }[] = []
    const walk = async (dir: string) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue // 与 chokidar 的 ignored 规则保持一致
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { await walk(full); continue }
        if (!entry.name.endsWith('.md')) continue
        out.push({
          slug: path.relative(root, full).replace(/\\/g, '/').replace(/\.md$/, ''),
          filePath: full
        })
      }
    }
    await walk(root)
    return out
  }

  const reconcileMissing = async () => {
    try {
      const rows = await prisma.note.findMany({ select: { slug: true } })
      const known = new Set(rows.map((r) => r.slug))
      const missing = (await listVaultMarkdown(vaultPath)).filter((f) => !known.has(f.slug))
      if (!missing.length) return
      console.log(`[garden] watcher: 对账发现 ${missing.length} 篇笔记未入库，开始补入库`)
      for (const f of missing) {
        await enqueue(async () => {
          const changed = await processMarkdownFile(f.filePath)
          console.log(`[garden] watcher: 对账补入库${changed ? '成功' : '未生效'} ${f.slug}`)
        })
      }
      scheduleSuggestScan()
    } catch (e) {
      console.error('[garden] watcher: 对账失败（不影响监听）', e)
    }
  }

  // 新增/修改笔记后的「标签·领域建议」自动排队。
  // 节流 10 秒：autoSuggestRecent 内部是一次 DB 查询，批量事件下没必要每篇都扫一遍
  // （它的判据是「最近 2 分钟内入库」的时间窗，一次扫描天然覆盖同批文件）。
  let suggestScanAt = 0
  const scheduleSuggestScan = () => {
    if (Date.now() - suggestScanAt < 10_000) return
    suggestScanAt = Date.now()
    try {
      void autoSuggestRecent()
    } catch (e) {
      console.error('[garden] watcher: 自动建议排队失败', e)
    }
  }

  const watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    // 生产环境重启不重同步：避免全量处理把 updatedAt 刷成当天（内容未变的时间应保持真实修改时间）；
    // 运行中的文件变更（add/change/unlink）照常处理。开发环境保留全量重同步便于调试。
    ignoreInitial: process.env.NODE_ENV === 'production',
    // 生产环境（Docker 挂载目录/云服务器）inotify 事件可能不传递，改用轮询保证同步
    usePolling: process.env.NODE_ENV === 'production',
    interval: 1000,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  })

  watcher
    .on('add', async (filePath) => {
      if (filePath.endsWith('.md')) {
        // 批量导入完成后已由 import-ingest 主动入库的文件：跳过事件，避免二次解析
        if (isRecentlyIngested(filePath)) return
        await enqueue(async () => {
          const changed = await processMarkdownFile(filePath)
          if (changed) console.log(`[garden] watcher: 已写入笔记 ${filePath}`)
        })
        scheduleSuggestScan()
      }
    })
    .on('change', async (filePath) => {
      if (filePath.endsWith('.md')) {
        if (isRecentlyIngested(filePath)) return
        await enqueue(async () => {
          const changed = await processMarkdownFile(filePath)
          // 内容未变（仅时间戳被触碰 / 编辑器重写）时不刷日志，避免批量事件刷屏
          if (changed) console.log(`[garden] watcher: 已更新笔记 ${filePath}`)
        })
        scheduleSuggestScan()
      }
    })
    .on('unlink', async (filePath) => {
      if (filePath.endsWith('.md')) {
        await enqueue(async () => {
          await removeMarkdownFile(filePath)
          console.log(`[garden] watcher: 已删除笔记 ${filePath}`)
        })
      }
    })

  // 启动时对账一次（生产 ignoreInitial: true，启动时的存量文件不会被重同步），
  // 之后每 5 分钟对账一次，兜住「运行期入库失败」的文件（如曾经的数字标题笔记）。
  // 代价很小：一次 readdir 递归 + 一次只取 slug 的查询，且没有任何文件需要补时立即返回。
  const reconcileTimer = setInterval(() => { void reconcileMissing() }, 5 * 60_000)
  reconcileTimer.unref?.()
  watcher.on('ready', () => { void reconcileMissing() })

  // 开发环境：初始全量同步完成后跑一次成熟度全量重算（双口径入链），
  // 修正单篇同步时用 DB 旧入链数得出的暂态判定。生产环境通过
  // POST /api/admin/maturity/recompute 手动触发（季度复核，文档 10.5）。
  if (process.env.NODE_ENV !== 'production') {
    watcher.on('ready', () => {
      enqueue(async () => {
        const r = await recomputeAllMaturity()
        console.log(`[garden] watcher: 成熟度全量重算完成 · 扫描 ${r.scanned} · 更新 ${r.updated} · 人工值跳过 ${r.skippedManual}`)
      })
    })
  }

  nitroApp.hooks.hook('close', () => {
    clearInterval(reconcileTimer)
    watcher.close()
  })
})
