/**
 * 「vault 正被整库级操作占用」的全局标记。
 *
 * ## 为什么需要它
 *
 * watcher 是按文件事件（add / change / unlink）驱动的，这对「用户改一篇笔记」完全正确，
 * 但对**整库级操作**是灾难：恢复备份会先清空 vault 再复制回来，于是
 *   · 每个被删的文件触发 unlink → `removeMarkdownFile` → **整库 Note 行被删光**；
 *   · 每个复制回来的文件触发 add → `processMarkdownFile` → 行被重建，
 *     `createdAt` 变成恢复当天（笔记的「创建于」永久失真）；
 *   · 紧接着 `scheduleSuggestScan()` 看到「全库都是刚创建的」→ 给 500 多篇排队生成建议
 *     （若开了 AI，这一步会真花钱）。
 *
 * 实测记录（本地 524 篇的库恢复一次）：`Note.createdAt` 全部被刷成恢复时刻，
 * `Suggestion` 表一次性多出 514 条 pending。这不是推测，是当时的真实数据。
 *
 * ## 用法
 *
 * ```
 * beginVaultBusy(120_000, '恢复备份')
 * try { ...整库读写... } finally { endVaultBusy(5_000) }
 * ```
 * `endVaultBusy` 的宽限参数不能省：chokidar 配了 `awaitWriteFinish`（稳定窗口 1 秒），
 * 事件到达比文件写完晚，立刻解除标记会让最后一批事件照样漏进来。
 *
 * 代价要说清楚：标记生效期内**真实用户改动也会被丢弃**。可接受的理由是
 * 「整库操作本来就在替换全部内容」，且 add 类遗漏有 watcher 的 5 分钟对账兜底。
 */
let busyUntil = 0
let busyReason = ''

/** 标记 vault 正在被整库操作占用（可叠加，取更晚的截止时间） */
export function beginVaultBusy(ms = 120_000, reason = ''): void {
  const until = Date.now() + Math.max(0, ms)
  if (until > busyUntil) busyUntil = until
  if (reason) busyReason = reason
}

/**
 * 解除占用。
 * @param graceMs 宽限期 —— 留给 chokidar 的 awaitWriteFinish 把最后一批事件送进来
 */
export function endVaultBusy(graceMs = 5_000): void {
  busyUntil = Date.now() + Math.max(0, graceMs)
  busyReason = ''
}

/** 当前是否处于整库操作窗口内（watcher 的每个事件处理器都要先问这一句） */
export function isVaultBusy(): boolean {
  return Date.now() < busyUntil
}

/** 占用原因（仅用于日志，便于事后解释「为什么这段时间没有入库」） */
export function vaultBusyReason(): string {
  return busyReason
}