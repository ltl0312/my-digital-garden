import chokidar from 'chokidar'
import path from 'path'
import { defineNitroPlugin } from '#imports'
import { processMarkdownFile, removeMarkdownFile } from '../utils/markdown'

export default defineNitroPlugin((nitroApp) => {
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
    ignoreInitial: false,
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
        await enqueue(async () => {
          await processMarkdownFile(filePath)
          console.log(`[garden] watcher: 已写入笔记 ${filePath}`)
        })
      }
    })
    .on('change', async (filePath) => {
      if (filePath.endsWith('.md')) {
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

  nitroApp.hooks.hook('close', () => {
    watcher.close()
  })
})
