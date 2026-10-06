// 标签 · 领域审核面板的**跨页面开关** + 「对指定笔记判定并审核」的统一入口
//
// 为什么需要这个 composable：
//   · 审核面板挂在 default 布局根部（全局浮层），而唤起它的入口有多处且分布在不同页面 ——
//     ① 管理后台的按钮与多选器 ② 结构树右键菜单（文件/文件夹） ③ 笔记详情页「更多操作」
//     ④ 列表行长按操作面板。若各自持有一个 open ref，只有自己那个能开，跨页面就会「点了没反应」。
//   · 「生成建议 → 打开审核面板并只看这几篇」这套流程各处完全一样，写成一份才不会漂移。
//
// ⚠️ 分片提交（CHUNK）不是优化而是**必需**：生产 Nginx 没设 `proxy_read_timeout`（默认 60s），
// 一次提交几百篇会超过 60s 被反代 504 —— 前端 `$fetch` 抛错，调用方若把「关闭弹窗」写在
// try 成功分支之后，弹窗就会**卡住不关**（实测用户反馈：「点生成建议之后弹窗并不会消失，
// 反而阻挡了新弹窗的生成」）。分片后单片稳定在几十秒内，且每片都有独立回执、逐片容错。
export const useSuggestionReview = () => {
  const open = useState<boolean>('suggest-review-open', () => false)
  const onlyIds = useState<string[]>('suggest-review-only-ids', () => [])
  /** 判定进行中（入口按钮据此显示 loading / 禁用） */
  const generating = useState<boolean>('suggest-generating', () => false)
  /** 分片进度文案（如 "100/260"）；单片时为空串 */
  const progress = useState<string>('suggest-progress', () => '')

  const toast = useToast()

  /** 打开并只看指定的建议 id（空数组 = 看全部待审） */
  const openReview = (ids: string[] = []) => {
    onlyIds.value = ids
    open.value = true
  }

  /** 单片最多提交多少篇（配合 Nginx 默认 60s 读超时；实测 50 篇远低于超时） */
  const CHUNK = 50

  /**
   * 对指定笔记生成建议（**不打开面板**）。返回成功与失败的 slug。
   * 逐片容错：一片失败（超时/500）不影响其余片，也不会抛异常打断调用方。
   */
  const generateForSlugs = async (
    slugs: string[]
  ): Promise<{ ok: string[]; failed: Array<{ slug: string; error?: string }>; emptyTags: number }> => {
    const list = [...new Set(slugs.map(s => s.trim()).filter(Boolean))]
    if (!list.length) return { ok: [], failed: [], emptyTags: 0 }

    generating.value = true
    const ok: string[] = []
    const failed: Array<{ slug: string; error?: string }> = []
    let emptyTags = 0
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK)
        progress.value = list.length > CHUNK ? `${Math.min(i + CHUNK, list.length)}/${list.length}` : ''
        try {
          const res = await $fetch<{
            processed: number
            failed: Array<{ slug: string; error?: string }>
            stats?: { emptyTags?: number }
          }>('/api/admin/suggestions', {
            method: 'POST',
            body: { scope: 'slugs', slugs: part, immediate: true }
          })
          const bad = new Set((res.failed || []).map(f => f.slug))
          for (const s of part) if (!bad.has(s)) ok.push(s)
          if (res.failed?.length) failed.push(...res.failed)
          emptyTags += Number(res.stats?.emptyTags || 0)
        } catch (e: any) {
          // 整片失败：这一片都记为失败，继续下一片（不因为一片超时就放弃其余）
          const msg = e?.data?.message || e?.message || '请求失败'
          for (const s of part) failed.push({ slug: s, error: msg })
        }
      }
    } finally {
      generating.value = false
      progress.value = ''
    }
    return { ok, failed, emptyTags }
  }

  /**
   * 「对这几篇判定 → 打开审核面板并只看这几篇」的完整流程。
   * 所有入口（管理后台多选器 / 结构树右键 / 详情页更多操作 / 列表行长按）都用它。
   */
  const reviewForSlugs = async (slugs: string[]): Promise<void> => {
    const list = [...new Set(slugs.map(s => s.trim()).filter(Boolean))]
    if (!list.length) { toast.warn('没有可判定的笔记'); return }

    const { ok, failed, emptyTags } = await generateForSlugs(list)

    if (!ok.length) {
      toast.error(failed[0]?.error ? `判定失败：${failed[0].error}` : '判定失败')
      return
    }
    if (failed.length) {
      toast.warn(`${ok.length} 篇已判定，${failed.length} 篇失败：${failed[0]?.error || '未知原因'}`)
    } else if (emptyTags === ok.length) {
      toast.success(`已判定 ${ok.length} 篇，但都没匹配到可推荐的既有标签（可手动补充）`)
    } else {
      toast.success(`已判定 ${ok.length} 篇，请审核`)
    }

    // 把面板收敛到刚判定的这几篇：入口给的是 slug，面板按建议 id 过滤，回查一次做映射
    try {
      const res = await $fetch<{ items: Array<{ id: string; slug: string }> }>('/api/admin/suggestions?limit=500')
      const wanted = new Set(ok)
      const ids = (res.items || []).filter(i => wanted.has(i.slug)).map(i => i.id)
      openReview(ids)
    } catch {
      // 映射失败就退回「看全部待审」，至少不让入口变成死路
      openReview()
    }
  }

  /** 目录 → 该目录下全部笔记的 slug（供结构树右键对文件夹判定） */
  const collectSlugsInDir = async (dir: string): Promise<string[]> => {
    const out: string[] = []
    let page = 1
    // 上限 10 页 × 100 = 1000 篇，足够；分页拉取避免一次取全库
    while (page <= 10) {
      const res = await $fetch<{ notes: Array<{ slug: string }>; totalPages: number }>(
        `/api/notes?dir=${encodeURIComponent(dir)}&pageSize=100&page=${page}&sort=updated`
      )
      for (const n of res.notes || []) out.push(n.slug)
      if (!res.totalPages || page >= res.totalPages) break
      page++
    }
    return out
  }

  return { open, onlyIds, openReview, generateForSlugs, reviewForSlugs, collectSlugsInDir, generating, progress }
}
