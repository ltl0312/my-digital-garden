import chokidar from 'chokidar'
import path from 'path'
import { defineNitroPlugin } from '#imports'
import { processMarkdownFile, removeMarkdownFile } from '../utils/markdown'
import { recomputeAllMaturity } from '../utils/maturity-sync'
import { isRecentlyIngested } from '../utils/import-job'

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
          await processMarkdownFile(filePath)
          console.log(`[garden] watcher: 已写入笔记 ${filePath}`)
        })
      }
    })
    .on('change', async (filePath) => {
      if (filePath.endsWith('.md')) {
        if (isRecentlyIngested(filePath)) return
        await enqueue(async () => {
          await processMarkdownFile(filePath)
          console.log(`[garden] watcher: 已更新笔记 ${filePath}`)
        })
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
    watcher.close()
  })
})
