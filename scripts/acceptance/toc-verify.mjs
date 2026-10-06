// 右侧目录（TocRail）跟随行为的 UI 验收
//
// 覆盖的真实 bug（用户反馈：「笔记正文上下滑动时，右边的目录却不会跟着动」）：
//   IntersectionObserver 一直是好的（实测正文滚到 60% 时高亮从 -1 变到 47、进度环 0%→60%），
//   但**目录列表自身从不滚动** —— 列表 `scrollTop` 恒为 0，而活动项已经在 437px 高的列表视口
//   **下方 1668px** 处（87 个标题的笔记）。于是列表可见部分永远不变，主观感受就是「目录不跟着动」。
//   T3 就是这条的回归断言：滚动后活动项必须落在列表可视区内。
//
// 只读：仅导航、滚动、点击目录项，不写任何数据。
import { BASE, ROOT_KEY, CHROME, loadPuppeteer } from './_env.mjs'

const results = []
const log = (id, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} | ${id}${extra ? ' | ' + extra : ''}`)
  console.log(results.at(-1))
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const vr = await fetch(BASE + '/api/auth/verify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: ROOT_KEY })
})
const cookie = (vr.headers.get('set-cookie') || '').split(';')[0]
if (!cookie) { console.error('缺少 GARDEN_ROOT_KEY 或登录失败'); process.exit(2) }

const j = async (p) => (await fetch(BASE + p, { headers: { cookie }, signal: AbortSignal.timeout(60_000) })).json()

// 找一篇标题足够多的笔记（标题太少时判定带不易触发，不适合做这条断言）
const list = await j('/api/notes?pageSize=100&sort=reading')
let target = '', headCount = 0
for (const n of list.notes || []) {
  const d = await j('/api/notes/' + n.slug.split('/').map(encodeURIComponent).join('/'))
  const c = (String(d.htmlContent || '').match(/<h[23][^>]*>/g) || []).length
  if (c >= 8) { target = n.slug; headCount = c; break }
}
if (!target) { console.error('没找到 h2/h3 ≥ 8 的笔记，无法验收'); process.exit(2) }

const puppeteer = await loadPuppeteer()
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 950 })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
await browser.setCookie({ name: 'garden_token', value: cookie.replace('garden_token=', ''), domain: new URL(BASE).hostname, path: '/' })

const probe = () => page.evaluate(() => {
  const rail = document.querySelector('[data-toc-rail]')
  if (!rail) return null
  const ul = rail.querySelector('nav ul')
  const items = [...(ul?.querySelectorAll('button') || [])]
  const activeIdx = items.findIndex(b => b.getAttribute('aria-current') === 'location')
  const btn = activeIdx >= 0 ? items[activeIdx] : null
  let visibleInList = null
  if (ul && btn) {
    const ub = ul.getBoundingClientRect(), bb = btn.getBoundingClientRect()
    visibleInList = bb.top >= ub.top - 1 && bb.bottom <= ub.bottom + 1
  }
  return {
    tocCount: items.length,
    activeIdx,
    listScrollTop: ul ? Math.round(ul.scrollTop) : -1,
    activeVisibleInList: visibleInList,
    pct: Number(((rail.innerText.match(/(\d+)%/) || [])[1]) ?? -1),
    articleScrollTop: Math.round(document.querySelector('[data-scroll-root]')?.scrollTop ?? -1)
  }
})

await page.goto(BASE + '/notes/' + target.split('/').map(encodeURIComponent).join('/'), { waitUntil: 'networkidle2', timeout: 90_000 })
await sleep(2500)

const before = await probe()
log('T1 目录渲染出与正文标题数一致的条目',
  !!before && before.tocCount === headCount && headCount >= 8,
  `toc=${before?.tocCount} headings=${headCount} note=${target.split('/').pop()}`)

// 滚到 60%
await page.evaluate(() => {
  const root = document.querySelector('[data-scroll-root]')
  if (root) root.scrollTop = Math.round((root.scrollHeight - root.clientHeight) * 0.6)
})
await sleep(2200)
const after = await probe()

log('T2 滚动后高亮跟随（activeIdx 变化）',
  !!after && after.activeIdx !== before?.activeIdx && after.activeIdx >= 0,
  `${before?.activeIdx} → ${after?.activeIdx}`)
log('T2b 进度环跟随',
  (after?.pct ?? -1) > (before?.pct ?? -1) && (after?.pct ?? 0) > 40,
  `${before?.pct}% → ${after?.pct}%`)

// ★ 本次修复的回归断言
log('T3 活动项落在目录列表可视区内（列表自身会跟随滚动）',
  after?.activeVisibleInList === true,
  `activeVisibleInList=${after?.activeVisibleInList} listScrollTop=${after?.listScrollTop}`)

// 点击目录项应跳到对应标题（用列表里最后一个可见项，避免依赖具体标题文案）
const clicked = await page.evaluate(() => {
  const rail = document.querySelector('[data-toc-rail]')
  const items = [...(rail?.querySelectorAll('nav ul button') || [])]
  const target = items[items.length - 1]
  if (!target) return null
  const label = target.textContent?.trim() || ''
  target.click()
  return { label, index: items.length - 1 }
})
await sleep(1800)
const afterClick = await probe()
log('T4 点击目录项能跳到对应标题',
  !!clicked && !!afterClick && afterClick.activeIdx === clicked.index,
  `点了第 ${clicked?.index} 项「${clicked?.label?.slice(0, 12)}」→ activeIdx=${afterClick?.activeIdx}`)
log('T5 点击后该活动项同样在列表可视区内',
  afterClick?.activeVisibleInList === true, `activeVisibleInList=${afterClick?.activeVisibleInList}`)

log('T6 运行期无 JS 错误', errors.length === 0, errors.join(' / ') || '(无)')

console.log(`\n总计 ${results.length} 项，失败 ${results.filter(r => r.startsWith('FAIL')).length} 项（只读）`)
await browser.close()
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
