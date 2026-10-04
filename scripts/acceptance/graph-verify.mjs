// 知识图谱界面重构验收（计划书 T5.2 / 验收目标 A1–A12）
//
// 断言一律走**语义钩子**（data-testid / aria-* / data-* 契约），不依赖类名子串或界面文案，
// 这样渲染分级从 SVG 切到 Canvas 时断言依然成立（见 scripts/acceptance/README.md）。
//
// 运行：先起应用（pnpm dev --port 3100 或 pnpm build && PORT=3100 pnpm start），
//       再在仓库根执行 `node scripts/acceptance/graph-verify.mjs`。
import { resolve } from 'node:path'
import { BASE, ROOT_KEY, CHROME, PROJECT_ROOT, loadPuppeteer } from './_env.mjs'

const puppeteer = await loadPuppeteer()

if (!ROOT_KEY) {
  console.error('[acceptance] 缺少登录密钥：请在仓库根目录创建 .env.acceptance（模板见 scripts/acceptance/.env.acceptance.example），或设置环境变量 GARDEN_ROOT_KEY。')
  process.exit(1)
}

const OUT = resolve(PROJECT_ROOT, '.workbuddy/backups/graph-verify')
const results = []
const pageErrors = []
const consoleErrors = []
const log = (id, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} | ${id}${extra ? ' | ' + extra : ''}`)
  console.log(results.at(-1))
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const page = await browser.newPage()
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)))
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
})
await page.setViewport({ width: 1440, height: 900 })

// ---------- 登录 ----------
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForSelector('input[type="password"]', { timeout: 60000 })
await sleep(600) // 等 hydrate 完成再输入，否则首个输入可能落在未绑定的 DOM 上
await page.type('input[type="password"]', ROOT_KEY)
await sleep(200)
await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('进入花园'))?.click())
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-create-menu]'), { timeout: 60000 })
await sleep(800)

const goto = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 90000 })
  await sleep(1000)
}
const setVp = async (w, h) => { await page.setViewport({ width: w, height: h }); await sleep(700) }

/** 元素可见性（与 e4-check / m34-verify 同口径：display 非 none 且有尺寸） */
const vis = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return false
  const r = el.getBoundingClientRect()
  return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0
}, sel)

/** 取若干个可点击节点在屏幕上的坐标（排除已固定/孤立的，双击它们会变成「解除固定」） */
const nodeHits = () => page.evaluate(() => {
  return Array.from(document.querySelectorAll('g.gnode'))
    .map((g) => {
      const d = g.__data__
      const r = g.getBoundingClientRect()
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        pinned: !!(d && d.fx != null && d.fy != null),
        title: d ? d.title : '',
        degree: d && typeof d.degree === 'number' ? d.degree : 0,
        isolated: !!(d && d.isolated)
      }
    })
    .filter(n => Number.isFinite(n.x) && Number.isFinite(n.y) && n.x > 0 && n.y > 0 && !n.pinned)
})

/**
 * 配色快照 —— 必须在**任何用例跑之前**取（下面 G67 的「清除全部颜色」会连用户自己的
 * 配色一起清掉），跑完整套再原样放回去。对生产跑验收时才不会删掉人家配好的颜色和规则。
 */
const colorBackup = {
  colors: await page.evaluate(() => fetch('/api/graph/colors').then(r => r.json()).then(j => j.colors).catch(() => null)),
  rules: await page.evaluate(() => fetch('/api/graph/color-rules').then(r => r.json()).catch(() => null))
}

// ================= A1/A3 骨架 + 就绪 =================
await goto('/graph')
await page.waitForFunction(() => document.querySelector('[data-testid="graph-canvas"]')?.getAttribute('data-graph-ready') === '1', { timeout: 60000 }).catch(() => {})
const ready = await page.evaluate(() => document.querySelector('[data-testid="graph-canvas"]')?.getAttribute('data-graph-ready') === '1')
log('G01 画布就绪 data-graph-ready=1', ready)
log('G02 骨架屏已让位', !(await page.evaluate(() => !!document.querySelector('[data-testid="graph-skeleton"]'))))

const zone = await page.evaluate(() => {
  const pick = (s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display }
  }
  return { left: pick('[data-testid="graph-left-panel"]'), canvas: pick('[data-testid="graph-canvas"]'), right: pick('[data-testid="graph-right-panel"]') }
})
log('G03 三区骨架同时存在', !!zone.left && !!zone.canvas && !!zone.right)
log('G04 左栏宽 240–272', !!zone.left && zone.left.w >= 240 && zone.left.w <= 272, `w=${zone.left?.w}`)
log('G05 右栏宽 288–320', !!zone.right && zone.right.w >= 288 && zone.right.w <= 320, `w=${zone.right?.w}`)
log('G06 画布不被左右栏挤出', !!zone.canvas && zone.canvas.w > 400, `w=${zone.canvas?.w}`)

// ================= A12 渲染状态常驻 =================
const perf = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-perf"]')
  const fps = document.querySelector('[data-testid="graph-fps"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { text: el.textContent.replace(/\s+/g, ' ').trim(), fps: fps ? fps.textContent.trim() : '', visible: getComputedStyle(el).display !== 'none' && r.width > 0 }
})
log('G07 渲染状态条常驻可见', !!perf && perf.visible)
log('G08 FPS 打点格式正确', !!perf && /^\d+ FPS$/.test(perf.fps), perf?.fps)
log('G09 分级标签存在（SVG/Canvas）', !!perf && /(SVG|Canvas)/.test(perf.text), perf?.text)
log('G10 首帧耗时已打点', !!perf && /首帧 \d+ms/.test(perf.text))

// ================= A1/A2 交互语义 =================
const hits = await nodeHits()
log('G11 SVG 命中层已就绪', hits.length > 50, `hits=${hits.length}`)

// 单击 = 选中（右栏出现节点详情）
let picked = null
if (hits.length) {
  // 选画布中部的节点，避开顶部工具栏与右下缩放条
  const box = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="graph-canvas"]')
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  picked = hits.find(n => n.x > box.x + box.w * 0.25 && n.x < box.x + box.w * 0.7 && n.y > box.y + box.h * 0.3 && n.y < box.y + box.h * 0.7) || hits[0]
  await page.mouse.click(picked.x, picked.y)
  await sleep(450)
}
const detailShown = await vis('[data-testid="graph-open-note"]')
log('G12 单击节点 → 右栏节点详情', detailShown, picked ? picked.title : 'no-hit')

// 双击 = 进正文
let navigated = ''
if (picked) {
  // 双击必须走「规范 CDP 序列」：move → down/up(clickCount:1) → down/up(clickCount:2)。
  // page.mouse.click(x, y, { clickCount: 2 }) 只发一次 press/release，Chrome 不会派发 dblclick；
  // 两次普通 click() 的 detail 都是 1，也不会派发。只有第二次 press/release 带 clickCount:2 才行。
  await page.mouse.move(picked.x, picked.y)
  await page.mouse.down({ clickCount: 1 })
  await page.mouse.up({ clickCount: 1 })
  await sleep(50)
  await page.mouse.down({ clickCount: 2 })
  await page.mouse.up({ clickCount: 2 })
  await sleep(1600)
  navigated = page.url()
}
log('G13 双击节点 → 进入正文', /\/notes\//.test(navigated), navigated.replace(BASE, ''))

// ================= A4/A5/A6 筛选 =================
await goto('/graph')
const kindOn = () => page.evaluate(() => ({
  link: document.querySelector('[data-testid="graph-kind-link"]')?.getAttribute('aria-checked'),
  tag: document.querySelector('[data-testid="graph-kind-tag"]')?.getAttribute('aria-checked')
}))
const before = await kindOn()
log('G14 两种关系类型默认开启', before.link === 'true' && before.tag === 'true', JSON.stringify(before))
await page.click('[data-testid="graph-kind-tag"]')
await sleep(300)
const afterTag = await kindOn()
log('G15 关闭「标签共有」生效', afterTag.tag === 'false' && afterTag.link === 'true', JSON.stringify(afterTag))
await page.click('[data-testid="graph-kind-link"]')
await sleep(300)
const afterBoth = await kindOn()
log('G16 至少保留一种关系类型', !(afterBoth.link === 'false' && afterBoth.tag === 'false'), JSON.stringify(afterBoth))

// 领域多选在**同一维度内是并集**（跨维度才是交集），所以「选两个领域」不会得到空结果。
// 要造出确定性的空结果，得找一个真实数据里不存在的「领域 × 成熟度」组合。
const domainBoxCount = await page.evaluate(() => document.querySelectorAll('[data-testid="graph-legend"] input[type="checkbox"]').length)
log('G17 领域筛选用真 checkbox', domainBoxCount >= 2, `n=${domainBoxCount}`)
const conflict = await page.evaluate(async () => {
  const res = await fetch('/api/notes/graph')
  const data = await res.json()
  const seen = new Set(data.nodes.map(n => `${n.domain}|${n.maturity}`))
  const domains = [...new Set(data.nodes.map(n => n.domain))]
  const maturities = [...new Set(data.nodes.map(n => n.maturity))]
  for (const d of domains) {
    for (const m of maturities) {
      if (!seen.has(`${d}|${m}`)) return { domain: d, maturity: m }
    }
  }
  return null
})
const MATURITY_ORDER = ['EVERGREEN', 'GROWING', 'SEEDLING']
let conflictApplied = false
if (conflict && MATURITY_ORDER.includes(conflict.maturity)) {
  conflictApplied = await page.evaluate(({ domain, maturityIndex }) => {
    const labels = Array.from(document.querySelectorAll('[data-testid="graph-legend"] label'))
    const dLabel = labels.find(l => l.querySelector('[title]')?.getAttribute('title') === domain)
    if (!dLabel) return false
    dLabel.querySelector('input[type="checkbox"]')?.click()
    const mBoxes = document.querySelectorAll('[data-testid="graph-maturity-filter"] input[type="checkbox"]')
    if (mBoxes.length !== 3) return false
    mBoxes[maturityIndex]?.click()
    return true
  }, { domain: conflict.domain, maturityIndex: MATURITY_ORDER.indexOf(conflict.maturity) })
  await sleep(700)
}
const emptyBar = await vis('[data-testid="graph-filter-empty"]')
const canvasAlive = await vis('[data-testid="graph-canvas"]')
log('G18 无结果时给出提示条', conflictApplied && emptyBar,
  `${conflict ? conflict.domain + ' × ' + conflict.maturity : 'no-conflict'} · applied=${conflictApplied}`)
log('G19 无结果时不清空画布', canvasAlive)
if (emptyBar) {
  const cleared = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="graph-filter-empty"]')
    const btn = Array.from(bar.querySelectorAll('button')).find(b => b.textContent.includes('清除'))
    if (!btn) return false
    btn.click()
    return true
  })
  await sleep(500)
  log('G20 一键清除筛选可用', cleared && !(await vis('[data-testid="graph-filter-empty"]')))
}

// ================= A7 搜索 =================
await goto('/graph')
const searchBox = await page.$('input[placeholder="定位笔记…"]')
log('G21 常驻搜索输入框存在且可见', !!searchBox && (await vis('input[placeholder="定位笔记…"]')))
let searchOk = false
let searchText = ''
if (searchBox) {
  const title = await page.evaluate(() => {
    const g = document.querySelector('g.gnode')
    return g && g.__data__ ? g.__data__.title : ''
  })
  const q = (title || 'MOC').slice(0, 2)
  await searchBox.click()
  await searchBox.type(q, { delay: 30 })
  await sleep(500)
  searchText = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="graph-search-panel"]')
    return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
  })
  searchOk = !!searchText && /笔记|标签|领域|命令/.test(searchText)
}
log('G22 搜索下拉出现且按四组归类', searchOk, searchText)
const searchFooter = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-search-panel"]')
  return el ? /条结果 · \d+ ms/.test(el.textContent) : false
})
log('G23 搜索底部显示「N 条结果 · M ms」', searchFooter)

// ================= A10 布局切换 =================
await page.keyboard.press('Escape')
await sleep(300)
const layoutSwitched = await page.evaluate(async () => {
  const before = document.querySelector('[data-testid="graph-canvas"]')?.getAttribute('data-zoom')
  const combo = document.querySelector('[role="combobox"]')
  if (!combo) return { ok: false, reason: 'no-combobox', before }
  combo.click()
  await new Promise(r => setTimeout(r, 300))
  const opts = Array.from(document.querySelectorAll('[role="option"]'))
  const tree = opts.find(o => /层次树/.test(o.textContent))
  if (!tree) return { ok: false, reason: 'no-tree-option', before, n: opts.length }
  tree.click()
  return { ok: true, before }
})
await sleep(900)
const layoutAfter = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-canvas"]')
  const r = el?.getBoundingClientRect()
  return { alive: !!el && r.width > 0, nodes: document.querySelectorAll('g.gnode').length }
})
log('G24 布局可切换到「层次树」', layoutSwitched.ok && layoutAfter.alive && layoutAfter.nodes > 50, JSON.stringify(layoutSwitched) + ' ' + JSON.stringify(layoutAfter))

// ================= A9 键盘可达 =================
await goto('/graph')
const kb = await page.evaluate(async () => {
  const host = document.querySelector('[data-testid="graph-canvas"]')
  if (!host) return { ok: false }
  host.focus()
  return { ok: document.activeElement === host }
})
await page.keyboard.press('ArrowDown')
await sleep(400)
const kbSelected = await vis('[data-testid="graph-open-note"]')
log('G25 画布可聚焦（tabindex=0）', kb.ok)
log('G26 ↑↓←→ 可选中节点', kbSelected)
await page.keyboard.press('Escape')
await sleep(400)
log('G27 Esc 清除选中', !(await vis('[data-testid="graph-open-note"]')))

// ================= A8 缩略图 + 缩放条 =================
log('G28 缩略图存在', await vis('[data-testid="graph-minimap"]'))
log('G29 缩放条百分比可见', await vis('[data-testid="graph-zoom-level"]'))
const zoomBtns = await page.evaluate(() => ['放大', '缩小', '适配全图'].map(a => !!document.querySelector(`button[aria-label="${a}"]`)))
log('G30 缩放三键保留', zoomBtns.every(Boolean), JSON.stringify(zoomBtns))

// ================= A11 响应式回归 =================
const scrollAt = async (w, h) => {
  await setVp(w, h)
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
}
for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [768, 900], [390, 844]]) {
  const s = await scrollAt(w, h)
  log(`G31 无横向滚动 @${w}`, s.sw <= s.cw + 1, `sw=${s.sw} cw=${s.cw}`)
}

// 桌面：图例 / 统计常驻
await setVp(1440, 900)
await goto('/graph')
log('G32 @1440 图例可见', await vis('[data-testid="graph-legend"]'))
log('G33 @1440 统计可见', await vis('[data-testid="graph-stats"]'))
log('G34 @1440 底部折叠面板隐藏', !(await vis('[data-testid="graph-panel-toggle"]')))

// 手机：折叠面板可见，图例/统计收进面板
await setVp(390, 844)
await goto('/graph')
log('G35 @390 底部折叠面板可见', await vis('[data-testid="graph-panel-toggle"]'))
log('G36 @390 图例不可见', !(await vis('[data-testid="graph-legend"]')))
log('G37 @390 统计不可见', !(await vis('[data-testid="graph-stats"]')))
await page.evaluate(() => document.querySelector('[data-testid="graph-panel-toggle"]')?.click())
await sleep(500)
const panelTxt = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="graph-panel-toggle"]')
  const wrap = btn ? (btn.closest('div.absolute') || btn.parentElement) : null
  return wrap ? wrap.textContent.replace(/\s+/g, '') : ''
})
log('G38 展开面板含「图例/统计/节点」', /图例/.test(panelTxt) && /统计/.test(panelTxt) && /节点/.test(panelTxt), panelTxt.slice(0, 60))
const overflow = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="graph-panel-toggle"]')
  const wrap = btn ? (btn.closest('div.absolute') || btn.parentElement) : null
  if (!wrap) return null
  const r = wrap.getBoundingClientRect()
  return { right: Math.round(r.right), left: Math.round(r.left), vw: document.documentElement.clientWidth }
})
log('G39 面板不超出视口', !!overflow && overflow.right <= overflow.vw + 1 && overflow.left >= -1, JSON.stringify(overflow))

// 窄屏缩放下限（与 e4-check.mjs:194-197 同口径：每次点击间隔 280ms，
// 否则 d3 的 220ms transition 会被后续点击反复取消，等效只缩放一步）
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => document.querySelector('button[aria-label="缩小"]')?.click())
  await sleep(280)
}
await sleep(400)
const zoomNarrow = await page.evaluate(() => document.querySelector('[data-testid="graph-canvas"]')?.getAttribute('data-zoom'))
const k = zoomNarrow === null || zoomNarrow === undefined ? NaN : Number(zoomNarrow)
log('G40 @390 缩放下限落在 0.335–0.40', Number.isFinite(k) && k >= 0.335 && k <= 0.40, `k=${zoomNarrow}`)

// ================= A13/A14 标签策略 + 图谱控制面板 + 聚焦（需求 m01104）=================
await setVp(1440, 900)
await goto('/graph')

log('G43 @1440 图谱控制面板可见', await vis('[data-testid="graph-tuning-panel"]'))
const modeChecked = (m) => page.evaluate((mm) => document.querySelector(`[data-testid="graph-label-mode-${mm}"]`)?.getAttribute('aria-checked'), m)
log('G44 默认标签模式 = 仅 MOC', (await modeChecked('moc')) === 'true')

/**
 * 当前真正显示出来的标签：{ text, x, y }。
 * canvas 分级读 DOM 标签层 .graph-label，svg 分级读 text.gnode-label（opacity>=0.5）。
 * 坐标取 d3 的 d.x/d.y（仿真坐标），不受 <g> 盒子包含隐形文字影响。
 */
const labelNodes = () => page.evaluate(() => {
  const coords = {}
  for (const g of document.querySelectorAll('g.gnode')) {
    const d = g.__data__
    if (!d || !d.title) continue
    const t = d.title.length > 14 ? d.title.slice(0, 14) + '…' : d.title
    coords[t] = { x: d.x, y: d.y }
  }
  const out = []
  for (const el of document.querySelectorAll('.graph-label')) {
    if (getComputedStyle(el).display === 'none') continue
    const t = (el.textContent || '').trim()
    if (t && coords[t]) out.push({ text: t, x: coords[t].x, y: coords[t].y })
  }
  for (const el of document.querySelectorAll('text.gnode-label')) {
    if (Number(el.getAttribute('opacity') || 0) < 0.5) continue
    const t = (el.textContent || '').trim()
    if (t && coords[t]) out.push({ text: t, x: coords[t].x, y: coords[t].y })
  }
  return out
})
const visibleLabels = async () => [...new Set((await labelNodes()).map(n => n.text))]
/** 当前可见标签对应节点的两两平均距离（聚焦斥力生效时应当变大） */
const meanSpread = async () => {
  const seen = new Set()
  const pts = []
  for (const n of await labelNodes()) {
    if (seen.has(n.text)) continue
    seen.add(n.text)
    pts.push(n)
  }
  if (pts.length < 2) return null
  let sum = 0
  let cnt = 0
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      sum += Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)
      cnt++
    }
  }
  return sum / cnt
}
const isMocLabel = (t) => /^MOC\b/i.test(t)

const mocOnly = await visibleLabels()
log('G45 常态只显示 MOC 节点名', mocOnly.length > 0 && mocOnly.every(isMocLabel), `${mocOnly.length} 个：${mocOnly.slice(0, 3).join(' / ')}`)

await page.evaluate(() => document.querySelector('[data-testid="graph-label-mode-all"]')?.click())
await sleep(900)
const allLabels = await visibleLabels()
log('G46 切「全部」后出现非 MOC 标签', allLabels.length > mocOnly.length && allLabels.some(t => !isMocLabel(t)), `${mocOnly.length} → ${allLabels.length}`)

await page.evaluate(() => document.querySelector('[data-testid="graph-label-mode-moc"]')?.click())
await sleep(900)
const backMoc = await visibleLabels()
log('G47 切回「仅 MOC」恢复', backMoc.length > 0 && backMoc.every(isMocLabel), `${backMoc.length} 个`)

const sliderIds = await page.evaluate(() => ['nodeScale', 'edgeWidth', 'centerStrength', 'chargeStrength', 'linkStrength', 'linkDistance', 'focusRepel']
  .map(k => !!document.querySelector(`[data-testid="graph-tuning-${k}"]`)))
log('G48 控制面板含 7 个参数滑杆', sliderIds.every(Boolean), JSON.stringify(sliderIds))
const focusRepelDefault = await page.evaluate(() => document.querySelector('[data-testid="graph-tuning-focusRepel"]')?.value)
log('G49 聚焦斥力默认 2.4', Number(focusRepelDefault) === 2.4, `v=${focusRepelDefault}`)

// 控制面板自身不能被挤出：逐元素查横向溢出
const tuningOverflow = await page.evaluate(() => {
  const root = document.querySelector('[data-testid="graph-tuning-panel"]')
  if (!root) return ['no-panel']
  const bad = []
  for (const el of root.querySelectorAll('*')) {
    if (el.offsetWidth === 0 && el.offsetHeight === 0) continue
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) bad.push(el.className || el.tagName)
  }
  return bad
})
log('G55 控制面板内部无横向溢出', tuningOverflow.length === 0, tuningOverflow.slice(0, 3).join(' | ') || 'ok')

// 滑杆即时生效：拉大节点 → 半径变大，且写回 localStorage
const radiusOfFirst = () => page.evaluate(() => {
  const g = document.querySelector('g.gnode')
  return g && g.__data__ && typeof g.__data__.r === 'number' ? g.__data__.r : 0
})
const rBefore = await radiusOfFirst()
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-tuning-nodeScale"]')
  el.value = '1.8'
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(800)
const rAfter = await radiusOfFirst()
const savedScale = await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('garden-graph-settings-v3') || '{}').nodeScale } catch { return null }
})
log('G56 节点大小滑杆即时生效并写回存档', rAfter > rBefore && savedScale === 1.8, `${rBefore} → ${rAfter} / saved=${savedScale}`)

await page.evaluate(() => document.querySelector('[data-testid="graph-tuning-reset"]')?.click())
await sleep(800)
const rReset = await radiusOfFirst()
log('G57 「恢复默认」把参数复原', Math.abs(rReset - rBefore) < 0.01, `${rAfter} → ${rReset}`)


// 聚焦：只显示聚焦节点名 + 聚焦节点之间被推开
// 先清掉上一轮持久化的坐标/钉住状态，让布局从确定性播种重新开始，基线才可比
await page.evaluate(() => localStorage.removeItem('garden-graph-state'))
await goto('/graph')
// 必须等力导向跑稳再取坐标：刚 goto 完节点还在飞，点下去时目标已经飘走（实测会偶发选不中）
await sleep(2600)
const hits2 = await nodeHits()
const box2 = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-canvas"]')
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
// 聚焦测试要选一个**有邻居**的节点（孤立节点 2 跳集合只有自己，量不出斥力）
const centerHits = hits2.filter(n => n.x > box2.x + box2.w * 0.25 && n.x < box2.x + box2.w * 0.7 && n.y > box2.y + box2.h * 0.3 && n.y < box2.y + box2.h * 0.7)
const candidates = [
  ...centerHits.filter(n => n.degree >= 3 && !n.isolated),
  ...centerHits.filter(n => n.degree >= 1 && !n.isolated),
  ...hits2.filter(n => n.degree >= 3 && !n.isolated),
  ...centerHits,
  ...hits2
]
// 逐个试：命中不了就换下一个，避免因为叠层遮挡 / 节点飘移让整段断言连锁失败
let pick2 = null
let focusBtn = false
for (const cand of candidates.slice(0, 12)) {
  await page.mouse.click(cand.x, cand.y)
  await sleep(420)
  if (await vis('[data-testid="graph-focus-neighbors"]')) {
    pick2 = cand
    focusBtn = true
    break
  }
}
log('G50 节点详情含「聚焦邻居」按钮', focusBtn, pick2 ? pick2.title : 'no-hit')

let spreadBefore = null
let spreadAfter = null
let focusLabels = []
if (focusBtn) {
  await page.click('[data-testid="graph-focus-neighbors"]')
  await sleep(60) // 只取一帧：此时标签已切到聚焦集合，仿真还没跑开
  focusLabels = await visibleLabels()
  spreadBefore = await meanSpread()
  await sleep(4200) // 等聚焦后的力导向跑稳，再量最终间距
  spreadAfter = await meanSpread()
}
log('G51 聚焦后显示非 MOC 的聚焦节点名', focusLabels.length > 0 && focusLabels.some(t => !isMocLabel(t)), `${focusLabels.length} 个：${focusLabels.slice(0, 3).join(' / ')}`)
// 独立复算：从接口拉图，按选中节点做 2 跳 BFS，聚焦后可见的标签必须全部落在这个集合里
const focusScope = pick2
  ? await page.evaluate(async (selTitle) => {
      const res = await fetch('/api/notes/graph')
      const data = await res.json()
      const byId = new Map(data.nodes.map(n => [n.id, n]))
      const adj = new Map()
      for (const e of data.edges) {
        if (!adj.has(e.source)) adj.set(e.source, [])
        if (!adj.has(e.target)) adj.set(e.target, [])
        adj.get(e.source).push(e.target)
        adj.get(e.target).push(e.source)
      }
      const start = data.nodes.find(n => n.title === selTitle)
      if (!start) return null
      const seen = new Set([start.id])
      let frontier = [start.id]
      for (let h = 0; h < 2; h++) {
        const next = []
        for (const id of frontier) {
          for (const nb of (adj.get(id) || [])) if (!seen.has(nb)) { seen.add(nb); next.push(nb) }
        }
        frontier = next
      }
      return [...seen].map(id => byId.get(id)?.title).filter(Boolean)
    }, pick2.title)
  : null
const truncLabel = (t) => (t.length > 14 ? t.slice(0, 14) + '…' : t)
const scopeSet = new Set((focusScope || []).map(truncLabel))
log('G52 聚焦后只显示聚焦集合内的节点名', !!focusScope && focusLabels.length > 0 && focusLabels.every(t => scopeSet.has(t)),
  `集合 ${scopeSet.size} 个 · 可见 ${focusLabels.length} 个`)
const grew = Number.isFinite(spreadBefore) && Number.isFinite(spreadAfter) && spreadAfter > spreadBefore * 1.02
log('G53 聚焦斥力生效（聚焦节点被推开）', grew, `${spreadBefore === null ? 'n/a' : spreadBefore.toFixed(1)} → ${spreadAfter === null ? 'n/a' : spreadAfter.toFixed(1)}`)

// 「聚焦斥力」这个倍数本身生效：1.0（等于不加成）与 5.0（强加成）分别跑到稳定态比间距
const setTuning = (key, val) => page.evaluate(([k, v]) => {
  const el = document.querySelector(`[data-testid="graph-tuning-${k}"]`)
  if (!el) return false
  el.value = String(v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}, [key, val])
if (focusBtn) {
  await setTuning('focusRepel', 1)
  await sleep(4200)
  const spreadLow = await meanSpread()
  await setTuning('focusRepel', 5)
  await sleep(4200)
  const spreadHigh = await meanSpread()
  log('G58 聚焦斥力倍数生效（1.0 → 5.0 聚焦节点被推得更开）',
    spreadLow != null && spreadHigh != null && spreadHigh > spreadLow * 1.15,
    `${spreadLow === null ? 'n/a' : spreadLow.toFixed(1)} → ${spreadHigh === null ? 'n/a' : spreadHigh.toFixed(1)}`)
  await setTuning('focusRepel', 2.4)
  await sleep(400)
}

const pageTitle = await page.title()
log('G54 标签标题为「知识图谱 · 拾光」', /知识图谱 · 拾光/.test(pageTitle), pageTitle)

// ============ 缩略图 / 连线颜色 / 右键菜单 / 左栏收起（需求 m01569 第 1–6 条） ============
await setVp(1440, 900)
await goto('/graph')
await page.evaluate(() => {
  localStorage.removeItem('garden-graph-node-colors')
  localStorage.removeItem('garden-graph-state')
})
await goto('/graph')
await sleep(2600)

const mm = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-minimap"]')
  if (!el) return null
  const g = el.querySelector('g')
  const m = /scale\(([\d.eE+-]+)\)/.exec((g && g.getAttribute('transform')) || '')
  const scale = m ? Number(m[1]) : 1
  const dots = [...el.querySelectorAll('circle.mm-dot')]
  const rs = dots.map(c => Number(c.getAttribute('r')) * scale).filter(Number.isFinite)
  const fills = new Set(dots.map(c => (c.getAttribute('fill') || '').toUpperCase()))
  return {
    dots: dots.length,
    edges: el.querySelectorAll('line.mm-edge').length,
    colors: fills.size,
    maxR: rs.length ? Math.max(...rs) : 0,
    minR: rs.length ? Math.min(...rs) : 0,
    scale
  }
})
log('G59 缩略图点径为屏幕像素量级（不再糊成一片灰）',
  !!mm && mm.dots > 100 && mm.maxR <= 6 && mm.minR >= 0.4,
  mm ? `dots=${mm.dots} r=${mm.minR.toFixed(2)}–${mm.maxR.toFixed(2)}px scale=${mm.scale.toFixed(4)}` : 'no-minimap')
log('G60 缩略图按领域着色', !!mm && mm.colors >= 3, mm ? `${mm.colors} 种颜色` : 'n/a')
log('G61 缩略图画出了连线', !!mm && mm.edges > 50, mm ? `${mm.edges} 条` : 'n/a')

const edgeTokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  const v = (n) => cs.getPropertyValue(n).trim()
  return { link: v('--edge-link'), tag: v('--edge-tag'), line: v('--line'), canvas: v('--canvas') }
})
const luminance = (hex) => {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 3 && h.length !== 6) return NaN
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const rgb = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}
const contrast = (a, b) => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const linkContrast = contrast(edgeTokens.link, edgeTokens.canvas)
const lineContrast = contrast(edgeTokens.line, edgeTokens.canvas)
log('G62 连线颜色对比度高于旧值（肉眼可见）',
  Number.isFinite(linkContrast) && linkContrast > 1.8 && linkContrast > lineContrast * 1.5,
  `--edge-link=${edgeTokens.link} 对比 ${linkContrast.toFixed(2)} vs --line 对比 ${lineContrast.toFixed(2)}`)

const canvasBox = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-canvas"]')
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
const hits3 = await nodeHits()
const pickMenu = hits3.filter(n => n.x > canvasBox.x + 24 && n.x < canvasBox.x + canvasBox.w - 24
  && n.y > canvasBox.y + 96 && n.y < canvasBox.y + canvasBox.h - 80)
const menuCands = [
  ...pickMenu.filter(n => n.degree >= 3),
  ...pickMenu,
  ...hits3
]
const readMenuKind = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-context-menu"]')
  return el ? el.getAttribute('data-menu-kind') : null
})
let menuNode = null
let menuKind = null
for (const cand of menuCands.slice(0, 10)) {
  await page.mouse.click(cand.x, cand.y, { button: 'right' })
  await sleep(420)
  if (await readMenuKind() === 'node') {
    menuNode = cand
    menuKind = 'node'
    break
  }
}
log('G63 节点右键弹出节点菜单', menuKind === 'node', `kind=${menuKind} node=${menuNode ? menuNode.title : 'no-hit'}`)

const menuIds = () => page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="graph-menu-"]')].map(e => e.getAttribute('data-testid')))
const nodeMenuItems = await menuIds()
const wantNode = ['graph-menu-open', 'graph-menu-focus', 'graph-menu-path-start', 'graph-menu-path-end',
  'graph-menu-pin', 'graph-menu-copy-link', 'graph-menu-copy-title', 'graph-menu-detach', 'graph-menu-color-reset']
log('G64 节点菜单项齐全', wantNode.every(id => nodeMenuItems.includes(id)),
  `缺 ${wantNode.filter(id => !nodeMenuItems.includes(id)).join(',') || '无'} · 共 ${nodeMenuItems.length} 项`)

// 上色前先记下数据库里**已有**多少自定义色：验收可能跑在一个干净库上，也可能跑在
// 用户已经配过色的生产库上，断言必须相对基线而不是写死 1。
const colorBase = await page.evaluate(async () => {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem('garden-graph-colors-v2') || '{}') } catch { /* ignore */ }
  let server = null
  try { server = await fetch('/api/graph/colors').then(r => r.json()) } catch { /* ignore */ }
  const txt = (document.querySelector('[data-testid="graph-color-count"]') || {}).textContent || ''
  const m = txt.match(/(\d+)/)
  return {
    n: Object.keys(saved).length,
    serverN: server ? server.count : -1,
    shown: m ? Number(m[1]) : 0
  }
})

await page.evaluate(() => document.querySelector('[data-testid="graph-menu-color-E5484D"]') && document.querySelector('[data-testid="graph-menu-color-E5484D"]').click())
await sleep(1500) // 本地写入是同步的，服务端推送有 600ms 防抖
const colorState = await page.evaluate(async () => {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem('garden-graph-colors-v2') || '{}') } catch { /* ignore */ }
  let server = null
  try { server = await fetch('/api/graph/colors').then(r => r.json()) } catch { /* ignore */ }
  return {
    n: Object.keys(saved).length,
    value: Object.values(saved)[0] || null,
    valuesUpper: Object.values(saved).map(v => String(v).toUpperCase()),
    serverN: server ? server.count : -1,
    serverValue: server ? (Object.values(server.colors || {})[0] || null) : null,
    serverUpper: server ? Object.values(server.colors || {}).map(v => String(v).toUpperCase()) : [],
    count: (document.querySelector('[data-testid="graph-color-count"]') || {}).textContent || null,
    menuOpen: !!document.querySelector('[data-testid="graph-context-menu"]')
  }
})
log('G65 设置颜色后写回本地缓存并计数',
  colorState.n === colorBase.n + 1 && Number(String(colorState.count || '').trim()) === colorBase.shown + 1
  && colorState.valuesUpper.includes('#E5484D') && !colorState.menuOpen,
  `cache=${colorState.n}(${colorState.value}) count=${String(colorState.count || '').trim()} menuOpen=${colorState.menuOpen} · 基线 ${colorBase.n}/${colorBase.shown}`)
log('G65b 颜色已同步到服务端（按用户）',
  colorState.serverN === colorBase.serverN + 1 && colorState.serverUpper.includes('#E5484D'),
  `server=${colorState.serverN}(${colorState.serverValue}) · 基线 ${colorBase.serverN}`)

const mmCustom = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="graph-minimap"] circle.mm-dot')]
    .filter(c => (c.getAttribute('fill') || '').toUpperCase() === '#E5484D').length)
log('G66 缩略图同步显示自定义颜色', mmCustom >= 1, `${mmCustom} 个点用了自定义色`)

await page.evaluate(() => {
  const b = document.querySelector('[data-testid="graph-tuning-clear-colors"]')
  if (b) b.click()
})
await sleep(1200)
const colorCleared = await page.evaluate(async () => {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem('garden-graph-colors-v2') || '{}') } catch { /* ignore */ }
  let server = null
  try { server = await fetch('/api/graph/colors').then(r => r.json()) } catch { /* ignore */ }
  return {
    n: Object.keys(saved).length,
    serverN: server ? server.count : -1,
    btn: !!document.querySelector('[data-testid="graph-tuning-clear-colors"]')
  }
})
log('G67 「清除全部自定义颜色」生效（本地 + 服务端）',
  colorCleared.n === 0 && colorCleared.serverN === 0 && !colorCleared.btn,
  `cache=${colorCleared.n} server=${colorCleared.serverN} 按钮残留=${colorCleared.btn}`)

// 画布空白处右键：挑一个离所有节点最远的候选点，避免误中节点
const hits4 = await nodeHits()
const blank = await page.evaluate((hits) => {
  const el = document.querySelector('[data-testid="graph-canvas"]')
  const r = el.getBoundingClientRect()
  const cands = []
  for (let gx = 0.1; gx <= 0.9; gx += 0.1) {
    for (let gy = 0.18; gy <= 0.84; gy += 0.1) cands.push({ x: r.left + r.width * gx, y: r.top + r.height * gy })
  }
  let best = null
  let bestD = -1
  for (const c of cands) {
    let d = Infinity
    for (const n of hits) d = Math.min(d, Math.hypot(n.x - c.x, n.y - c.y))
    if (d > bestD) { bestD = d; best = c }
  }
  return best
}, hits4)
if (blank) {
  await page.mouse.click(blank.x, blank.y, { button: 'right' })
  await sleep(450)
}
const canvasKind = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-context-menu"]')
  return el ? el.getAttribute('data-menu-kind') : null
})
const canvasMenuItems = await menuIds()
const wantCanvas = ['graph-menu-fit', 'graph-menu-reset-layout', 'graph-menu-reheat', 'graph-menu-clear-filters']
log('G68 空白处右键弹出画布菜单', canvasKind === 'canvas', `kind=${canvasKind}`)
log('G69 画布菜单项齐全', wantCanvas.every(id => canvasMenuItems.includes(id)),
  `缺 ${wantCanvas.filter(id => !canvasMenuItems.includes(id)).join(',') || '无'} · 共 ${canvasMenuItems.length} 项`)

await page.keyboard.press('Escape')
await sleep(320)
const menuGone = await page.evaluate(() => !document.querySelector('[data-testid="graph-context-menu"]'))
log('G70 Esc 关闭右键菜单', menuGone)

// 左栏收起 / 展开（需求第 3 条）
await setVp(1440, 900)
await goto('/graph')
await sleep(1300)
const leftBefore = await vis('[data-testid="graph-left-panel"]')
await page.click('[data-testid="graph-toggle-left"]')
await sleep(500)
const leftAfter = await vis('[data-testid="graph-left-panel"]')
await page.click('[data-testid="graph-toggle-left"]')
await sleep(500)
const leftBack = await vis('[data-testid="graph-left-panel"]')
log('G71 左栏可收起 / 展开', !!leftBefore && !leftAfter && !!leftBack, `${leftBefore} → ${leftAfter} → ${leftBack}`)

// 滑杆范围放宽（需求第 5 条）
const ranges = await page.evaluate(() => {
  const get = (k) => {
    const el = document.querySelector(`[data-testid="graph-tuning-${k}"]`)
    return el ? { min: Number(el.min), max: Number(el.max) } : null
  }
  return {
    nodeScale: get('nodeScale'),
    edgeWidth: get('edgeWidth'),
    chargeStrength: get('chargeStrength'),
    linkDistance: get('linkDistance'),
    focusRepel: get('focusRepel')
  }
})
log('G72 节点与连线滑杆范围已放宽',
  !!ranges.nodeScale && ranges.nodeScale.max >= 3 && ranges.nodeScale.min <= 0.3
  && !!ranges.edgeWidth && ranges.edgeWidth.max >= 5
  && !!ranges.chargeStrength && ranges.chargeStrength.max >= 6
  && !!ranges.linkDistance && ranges.linkDistance.max >= 5
  && !!ranges.focusRepel && ranges.focusRepel.max >= 10,
  JSON.stringify(ranges))

// ================= 颜色规则 + 自定义色按用户同步（需求 m00991 第 4/5/6 条） =================
// 全部走语义钩子：graph-rule-* 面板、/api/graph/color-rules、/api/graph/colors、/api/notes/graph/match。
const apiJson = (path, init) => page.evaluate(async (p, i) => {
  try { return await fetch(p, i).then(r => r.json()) } catch { return null }
}, path, init || undefined)
const serverRules = () => apiJson('/api/graph/color-rules')
const serverColors = () => apiJson('/api/graph/colors')

/** 缩略图点阵的颜色分布 —— Canvas 分级下唯一能从 DOM 读到「颜色真的作用到渲染层了」的地方 */
const minimapColors = () => page.evaluate(() => {
  const out = {}
  for (const c of document.querySelectorAll('[data-testid="graph-minimap"] circle.mm-dot')) {
    const k = (c.getAttribute('fill') || '').toUpperCase()
    out[k] = (out[k] || 0) + 1
  }
  return out
})

/** 节点在图坐标里的位置与固定态（d3 把 datum 挂在 DOM 元素上） */
const nodeStates = () => page.evaluate(() => {
  const out = {}
  for (const g of document.querySelectorAll('g.gnode')) {
    const d = g.__data__
    if (d && d.id) out[d.id] = { x: d.x, y: d.y, pinned: d.fx != null && d.fy != null, title: d.title }
  }
  return out
})

/** 规则列表（DOM 顺序即优先级，第一条命中生效） */
const readRules = () => page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="graph-rule-item"]')].map(el => {
    const t = ((el.querySelector('[data-testid="graph-rule-item-matches"]') || {}).textContent || '')
    const m = t.match(/(\d+)/)
    return {
      id: el.getAttribute('data-rule-id'),
      field: el.getAttribute('data-rule-field'),
      color: (el.getAttribute('data-rule-color') || '').toUpperCase(),
      enabled: el.getAttribute('data-rule-enabled') === '1',
      matches: m ? Number(m[1]) : -1
    }
  }))

const setInput = async (testid, text) => {
  const sel = `[data-testid="${testid}"]`
  await page.evaluate((q) => {
    const el = document.querySelector(q)
    if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })) }
  }, sel)
  await sleep(120)
  if (text) await page.type(sel, text, { delay: 12 })
}
/** 填新建规则表单。顺序有讲究：属性名输入框只在 field=property 时才存在 */
const fillDraft = async ({ field, op, key, value }) => {
  if (field) { await page.select('[data-testid="graph-rule-field"]', field); await sleep(200) }
  if (op) { await page.select('[data-testid="graph-rule-op"]', op); await sleep(180) }
  if (key !== undefined) await setInput('graph-rule-key', key)
  if (value !== undefined) await setInput('graph-rule-value', value)
}
const pickDraftColor = async (hex) => {
  await page.click(`[data-testid="graph-rule-color-${hex.replace('#', '')}"]`)
  await sleep(160)
}
const readPreview = () => page.evaluate(() => {
  const t = ((document.querySelector('[data-testid="graph-rule-preview"]') || {}).textContent || '').trim()
  const m = t.match(/将命中\s*(\d+)\s*个节点/)
  return { text: t, count: m ? Number(m[1]) : -1 }
})
const scrollRules = async () => {
  await page.evaluate(() => document.querySelector('[data-testid="graph-rule-panel"]')?.scrollIntoView({ block: 'start' }))
  await sleep(320)
}
/** 等某条规则的匹配数解析出来（正文 / 属性维度要等服务端检索回来） */
const waitRule = async (id, timeout = 6000) => {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeout) {
    last = (await readRules()).find(r => r.id === id) || null
    if (last && last.matches >= 0) return last
    await sleep(250)
  }
  return last
}
/** 建一条规则：填表 → 等预览 → 选色 → 提交 → 返回新规则 */
const addRule = async ({ field, op = 'contains', key, value, color, settle = 1000 }) => {
  const before = (await readRules()).map(r => r.id)
  await fillDraft({ field, op, key, value })
  await sleep(settle)
  const prev = await readPreview()
  await pickDraftColor(color)
  await page.click('[data-testid="graph-rule-submit"]')
  await sleep(700)
  const after = await readRules()
  const fresh = after.find(r => !before.includes(r.id))
  const settled = fresh ? await waitRule(fresh.id) : null
  return { prev, rule: settled, rules: after }
}

await setVp(1440, 900)
// 从「从未保存过规则」的干净状态开始：清本地缓存 + 删掉服务端那一行，让默认配色重新播种
await page.evaluate(() => localStorage.removeItem('garden-graph-color-rules-v1'))
await apiJson('/api/graph/color-rules', { method: 'DELETE' })
await apiJson('/api/graph/colors', { method: 'DELETE' })
await goto('/graph')
await sleep(2400)
await scrollRules()

log('G73 控制面板存在「颜色规则」区', await vis('[data-testid="graph-rule-panel"]'))

// —— 默认播种：领域 / 成熟度配色变成规则表里的预置规则 ——
const seeded = await readRules()
const seededServer = await serverRules()
log('G74 领域 / 成熟度配色已播种为规则并落服务端',
  seeded.some(r => r.field === 'domain') && seeded.some(r => r.field === 'maturity')
  && !!seededServer && seededServer.count === seeded.length && seededServer.count > 0,
  `面板 ${seeded.length} 条（领域 ${seeded.filter(r => r.field === 'domain').length} · 成熟度 ${seeded.filter(r => r.field === 'maturity').length}）· 服务端 ${seededServer ? seededServer.count : 'null'}`)

// —— 逐维度建规则：路径 / 文件名 / tag / 正文 / 笔记属性 ——
for (const [id, field, key, value, color, settle] of [
  ['G75', 'path', undefined, 'KnowledgeBase', '#0090FF', 1000],
  ['G76', 'filename', undefined, 'MOC', '#46A758', 1000],
  ['G77', 'tag', undefined, '素材', '#12A594', 1000],
  ['G78', 'content', undefined, '操作系统', '#3E63DD', 2200],
  ['G79', 'property', 'source', 'csdn', '#8E4EC6', 2200]
]) {
  const res = await addRule({ field, key, value, color, settle })
  const ok = !!res.rule && res.rule.field === field && res.rule.color === color
    && res.prev.count > 0 && res.rule.matches === res.prev.count
  log(`${id} 按「${field}」建规则并落库`, ok,
    `${key ? `key=${key} ` : ''}value=${value} · 预览「${res.prev.text}」· 列表匹配数 ${res.rule ? res.rule.matches : 'null'} · 色 ${res.rule ? res.rule.color : 'null'}`)
}

// —— 规则真的作用到渲染层 ——
await page.evaluate(() => document.querySelector('[data-testid="graph-minimap"]')?.scrollIntoView({ block: 'center' }))
await sleep(1600) // 页面每 700ms 同步一次缩略图快照
const mm1 = await minimapColors()
log('G80 规则色已作用到渲染层（缩略图点阵）',
  (mm1['#0090FF'] || 0) > 50,
  `#0090FF=${mm1['#0090FF'] || 0} #46A758=${mm1['#46A758'] || 0} #8E4EC6=${mm1['#8E4EC6'] || 0}`)

// —— 删除规则：清空用户规则后只剩播种的领域 / 成熟度 ——
await scrollRules()
const userRuleIds = (await readRules()).filter(r => r.field !== 'domain' && r.field !== 'maturity').map(r => r.id)
for (const id of userRuleIds) {
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-remove-${id}"]`)
  await sleep(160)
}
await sleep(1200)
const afterDelete = await readRules()
log('G81 删除规则（用户规则清空后只剩领域 / 成熟度）',
  userRuleIds.length === 5 && afterDelete.length === seeded.length
  && afterDelete.every(r => r.field === 'domain' || r.field === 'maturity'),
  `删了 ${userRuleIds.length} 条 · 剩 ${afterDelete.length} 条（${[...new Set(afterDelete.map(r => r.field))].join('/')}）`)

// —— 优先级：先建的规则胜出；把后面的规则上移一位，优先级翻转 ——
const ruleA = await addRule({ field: 'path', value: 'KnowledgeBase', color: '#D6409F' })
const ruleB = await addRule({ field: 'path', value: 'KnowledgeBase/03_Knowledge', color: '#E8730C' })
await sleep(1600)
const mmA = await minimapColors()
log('G82 优先级由列表顺序决定（先建的规则胜出）',
  !!ruleA.rule && !!ruleB.rule && (mmA['#E8730C'] || 0) === 0 && (mmA['#D6409F'] || 0) > 50,
  `#D6409F=${mmA['#D6409F'] || 0} #E8730C=${mmA['#E8730C'] || 0}（B 的匹配数 ${ruleB.rule ? ruleB.rule.matches : 'null'}）`)

if (ruleB.rule) {
  await scrollRules()
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-up-${ruleB.rule.id}"]`)
  await sleep(1800)
}
const mmB = await minimapColors()
log('G83 上移规则后优先级翻转',
  (mmB['#E8730C'] || 0) > 0 && (mmB['#D6409F'] || 0) < (mmA['#D6409F'] || 0),
  `#D6409F ${mmA['#D6409F'] || 0} → ${mmB['#D6409F'] || 0} · #E8730C ${mmA['#E8730C'] || 0} → ${mmB['#E8730C'] || 0}`)

// —— 停用 / 启用 ——
const toggleTarget = (await readRules()).find(r => r.color === '#E8730C')
if (toggleTarget) {
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-toggle-${toggleTarget.id}"]`)
  await sleep(1800)
}
const mmOff = await minimapColors()
const offFlag = (await readRules()).find(r => r.id === (toggleTarget && toggleTarget.id))
log('G84 停用规则后颜色立即失效',
  !!toggleTarget && offFlag && offFlag.enabled === false && (mmOff['#E8730C'] || 0) === 0,
  `enabled=${offFlag ? offFlag.enabled : 'null'} · #E8730C=${mmOff['#E8730C'] || 0}`)
if (toggleTarget) {
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-toggle-${toggleTarget.id}"]`)
  await sleep(1600)
}

// —— 行内改色 ——
const recolorTarget = (await readRules()).find(r => r.color === '#E8730C')
let editOk = false
let editDetail = '未找到目标规则'
if (recolorTarget) {
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-swatch-${recolorTarget.id}"]`)
  await sleep(300)
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-edit-color-${recolorTarget.id}-0090FF"]`)
  await sleep(200)
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-edit-done-${recolorTarget.id}"]`)
  await sleep(1800)
  const edited = (await readRules()).find(r => r.id === recolorTarget.id)
  editOk = !!edited && edited.color === '#0090FF'
  editDetail = `#E8730C → ${edited ? edited.color : 'null'}`
}
log('G85 规则行内改色', editOk, editDetail)

// —— 换设备：清掉本地缓存后仍能从服务端恢复规则 ——
const expectedRules = (await serverRules())
const expectedCount = expectedRules ? expectedRules.count : 0
await page.evaluate(() => localStorage.removeItem('garden-graph-color-rules-v1'))
await goto('/graph')
await sleep(2600)
await scrollRules()
const restoredRules = await readRules()
const restoredCache = await page.evaluate(() => {
  let cache = []
  try { cache = JSON.parse(localStorage.getItem('garden-graph-color-rules-v1') || '[]') } catch { /* ignore */ }
  return Array.isArray(cache) ? cache.length : -1
})
log('G86 清空本地缓存后从服务端恢复规则（同用户跨设备）',
  expectedCount > 0 && restoredRules.length === expectedCount && restoredCache === expectedCount,
  `服务端 ${expectedCount} · 界面 ${restoredRules.length} · 本地缓存 ${restoredCache}`)

// —— 未登录访问规则接口必须 401（按用户隔离的前提） ——
// 必须在 Node 侧发（无 cookie jar）：页面里 fetch 必然带 cookie，
// 用 headers.cookie 伪造也不行（Cookie 是 forbidden header，浏览器会丢掉它并换成真 cookie），
// 而故意触发 401 会在页面留下 console.error 把 G42 弄脏。
const anonRules = await fetch(BASE + '/api/graph/color-rules').catch(() => null)
log('G87 未带凭据访问颜色规则接口被拒',
  !!anonRules && (anonRules.status === 401 || anonRules.status === 403),
  `status=${anonRules ? anonRules.status : 'ERR'}`)

// —— /api/notes/graph/match 五个字段都可用 ——
const matchOk = await page.evaluate(async () => {
  const hit = async (params) => {
    const qs = new URLSearchParams({ limit: '5000', ...params }).toString()
    const r = await fetch(`/api/notes/graph/match?${qs}`)
    if (!r.ok) return { status: r.status }
    const j = await r.json()
    return { status: r.status, total: j.total, ids: Array.isArray(j.ids) ? j.ids.length : -1 }
  }
  return {
    path: await hit({ q: 'KnowledgeBase', fields: 'path' }),
    filename: await hit({ q: 'MOC', fields: 'filename' }),
    name: await hit({ q: 'MOC', fields: 'name' }),
    tag: await hit({ q: '素材', fields: 'tag' }),
    content: await hit({ q: '操作系统', fields: 'content' }),
    property: await hit({ q: 'csdn', fields: 'property', key: 'source' }),
    blank: await hit({ q: '', fields: 'content' })
  }
})
log('G88 /api/notes/graph/match 支持路径 / 文件名 / tag / 正文 / 笔记属性',
  ['path', 'filename', 'name', 'tag', 'content', 'property'].every(k => matchOk[k].total > 0)
  && matchOk.blank.total === 0
  && matchOk.path.ids === matchOk.path.total
  && matchOk.name.total === matchOk.filename.total,
  JSON.stringify(matchOk))

// —— 非法规则必须被服务端丢弃（颜色最终会进 SVG fill / canvas fillStyle） ——
const droppedRules = await page.evaluate(async () => {
  const r = await fetch('/api/graph/color-rules', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      rules: [
        { id: 'ok', enabled: true, field: 'path', op: 'contains', value: 'x', color: '#123456' },
        { id: 'bad-field', enabled: true, field: 'nope', op: 'contains', value: 'x', color: '#123456' },
        { id: 'bad-color', enabled: true, field: 'path', op: 'contains', value: 'x', color: 'javascript:alert(1)' },
        { id: 'bad-op', enabled: true, field: 'domain', op: 'contains', value: 'x', color: '#123456' }
      ]
    })
  })
  const j = await r.json()
  const after = await fetch('/api/graph/color-rules').then(x => x.json())
  // 四条里：非法字段与非法颜色各丢一条；domain 配 contains 属于算子非法，
  // 但会回落到该字段允许的第一个算子（equals）而不是整条丢弃。
  return {
    status: r.status,
    count: j.count,
    dropped: j.dropped,
    kept: after.count,
    fields: after.rules.map(x => x.field),
    ops: after.rules.map(x => x.op)
  }
})
log('G89 非法规则被服务端丢弃、非法算子回落到 equals',
  droppedRules.status === 200 && droppedRules.dropped === 2 && droppedRules.kept === 2
  && droppedRules.fields.includes('domain')
  && droppedRules.ops[droppedRules.fields.indexOf('domain')] === 'equals',
  JSON.stringify(droppedRules))

// —— 恢复默认配色 ——
await goto('/graph')
await sleep(2400)
await scrollRules()
await page.evaluate(() => document.querySelector('[data-testid="graph-rule-reset"]')?.click())
await sleep(1600)
const resetRules = await readRules()
const resetServer = await serverRules()
log('G90 恢复默认配色（领域 / 成熟度规则重新播种）',
  resetRules.length === seeded.length && resetRules.every(r => r.field === 'domain' || r.field === 'maturity')
  && !!resetServer && resetServer.count === resetRules.length,
  `面板 ${resetRules.length} · 服务端 ${resetServer ? resetServer.count : 'null'}`)

// 收尾：别把测试数据留给后面的用例
await apiJson('/api/graph/color-rules', { method: 'DELETE' })
await apiJson('/api/graph/colors', { method: 'DELETE' })
await page.evaluate(() => {
  localStorage.removeItem('garden-graph-color-rules-v1')
  localStorage.removeItem('garden-graph-colors-v2')
})

// —— 窄屏：颜色规则面板必须能经「筛选」抽屉打开（不能只在桌面三区模式下可用） ——
await setVp(390, 844)
await goto('/graph')
await sleep(2000)
const drawerBtn = await vis('[data-testid="graph-open-filters"]')
if (drawerBtn) {
  await page.click('[data-testid="graph-open-filters"]')
  await sleep(900)
}
const narrow = await page.evaluate(() => {
  const p = document.querySelector('[data-testid="graph-rule-panel"]')
  const aside = document.querySelector('[data-testid="graph-left-panel"]')
  if (!p) return { open: false, w: 0, inside: false, asideW: 0, vw: window.innerWidth }
  const r = p.getBoundingClientRect()
  const ar = aside ? aside.getBoundingClientRect() : null
  return {
    open: getComputedStyle(p).display !== 'none' && r.width > 0,
    w: Math.round(r.width),
    inside: r.left >= -1 && r.right <= window.innerWidth + 1,
    asideW: ar ? Math.round(ar.width) : 0,
    vw: window.innerWidth
  }
})
log('G91 窄屏下颜色规则面板可经「筛选」抽屉打开',
  drawerBtn && narrow.open && narrow.inside,
  `按钮=${drawerBtn} 面板宽=${narrow.w} 抽屉宽=${narrow.asideW} vw=${narrow.vw} 在视口内=${narrow.inside}`)

// ================= 手动单节点自定义色（右键层，优先级高于规则） =================
await setVp(1440, 900)
await goto('/graph')
await sleep(2200)
const canvasBox2 = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-canvas"]')
  if (!el) return { x: 0, y: 0, w: 0, h: 0 }
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
const hits5 = await nodeHits()
const pick5 = hits5.filter(n => n.x > canvasBox2.x + 24 && n.x < canvasBox2.x + canvasBox2.w - 24
  && n.y > canvasBox2.y + 96 && n.y < canvasBox2.y + canvasBox2.h - 80)
let menuNode2 = null
for (const cand of [...pick5.filter(n => n.degree >= 3), ...pick5, ...hits5].slice(0, 10)) {
  await page.mouse.click(cand.x, cand.y, { button: 'right' })
  await sleep(420)
  if (await readMenuKind() === 'node') { menuNode2 = cand; break }
}
await page.evaluate(() => document.querySelector('[data-testid="graph-menu-color-46A758"]')?.click())
await sleep(1600)
const manualColorState = await page.evaluate(async () => {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem('garden-graph-colors-v2') || '{}') } catch { /* ignore */ }
  let server = null
  try { server = await fetch('/api/graph/colors').then(r => r.json()) } catch { /* ignore */ }
  return {
    n: Object.keys(saved).length,
    value: Object.values(saved)[0] || null,
    serverCount: server ? server.count : -1,
    serverValue: server && server.colors ? Object.values(server.colors)[0] || null : null
  }
})
log('G92 右键单节点上色并同步到服务端',
  !!menuNode2 && manualColorState.n >= 1 && manualColorState.serverCount === manualColorState.n
  && String(manualColorState.value).toUpperCase() === '#46A758'
  && String(manualColorState.serverValue).toUpperCase() === '#46A758',
  `节点=${menuNode2 ? menuNode2.title : 'no-hit'} · 本地 ${manualColorState.n} 服务端 ${manualColorState.serverCount} 色 ${manualColorState.serverValue}`)

// —— 换设备：清掉本地缓存后仍能从服务端恢复 ——
const expectedColors = manualColorState.serverCount
await page.evaluate(() => {
  localStorage.removeItem('garden-graph-colors-v2')
  localStorage.removeItem('garden-graph-node-colors')
})
await goto('/graph')
await sleep(2400)
const restoredColors = await page.evaluate(() => {
  let cache = {}
  try { cache = JSON.parse(localStorage.getItem('garden-graph-colors-v2') || '{}') } catch { /* ignore */ }
  const txt = (document.querySelector('[data-testid="graph-color-count"]') || {}).textContent || ''
  const m = txt.match(/(\d+)/)
  return { cache: Object.keys(cache).length, shown: m ? Number(m[1]) : -1 }
})
log('G93 清空本地缓存后从服务端恢复自定义色（同用户跨设备）',
  expectedColors > 0 && restoredColors.cache === expectedColors && restoredColors.shown === expectedColors,
  `服务端 ${expectedColors} · 恢复后缓存 ${restoredColors.cache} · 界面计数 ${restoredColors.shown}`)

// —— 旧版（按 Note.id）存档一次性迁移到 slug 键并推上服务端 ——
await apiJson('/api/graph/colors', { method: 'DELETE' })
const sample = await page.evaluate(async () => {
  const g = await fetch('/api/notes/graph').then(r => r.json())
  const n = g.nodes.find(x => x.slug && x.id)
  return n ? { id: n.id, slug: n.slug } : null
})
if (sample) {
  await page.evaluate((s) => {
    localStorage.removeItem('garden-graph-colors-v2')
    localStorage.setItem('garden-graph-node-colors', JSON.stringify({ [s.id]: '#46A758' }))
  }, sample)
  await goto('/graph')
  await sleep(2400)
  const migrated = await apiJson('/api/graph/colors')
  const legacyLeft = await page.evaluate(() => !!localStorage.getItem('garden-graph-node-colors'))
  log('G94 旧版按 id 存档迁移为 slug 键并上传',
    !!migrated && migrated.colors && migrated.colors[sample.slug] === '#46A758' && !legacyLeft,
    `slug=${sample.slug} 服务端=${migrated ? JSON.stringify(migrated.colors) : 'null'} 旧键残留=${legacyLeft}`)
} else {
  log('G94 旧版按 id 存档迁移为 slug 键并上传', false, '取不到样本节点')
}

// —— 清除全部自定义颜色 ——
await page.evaluate(() => document.querySelector('[data-testid="graph-tuning-clear-colors"]')?.scrollIntoView({ block: 'center' }))
await sleep(300)
await page.evaluate(() => document.querySelector('[data-testid="graph-tuning-clear-colors"]')?.click())
await sleep(1800)
const afterClear = await apiJson('/api/graph/colors')
log('G95 清除全部自定义颜色', !!afterClear && afterClear.count === 0,
  `服务端剩 ${afterClear ? afterClear.count : 'null'}`)

// —— 未登录访问颜色接口必须 401 ——
const anonRes = await fetch(BASE + '/api/graph/colors').catch(() => null)
log('G96 未带凭据访问颜色接口被拒',
  !!anonRes && (anonRes.status === 401 || anonRes.status === 403),
  `status=${anonRes ? anonRes.status : 'ERR'}`)

// —— 非法颜色值必须被服务端丢弃 ——
const dropped = await page.evaluate(async () => {
  const r = await fetch('/api/graph/colors', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ colors: { 'x/ok.md': '#123456', 'x/bad.md': 'javascript:alert(1)' } })
  })
  const j = await r.json()
  const after = await fetch('/api/graph/colors').then(x => x.json())
  return { status: r.status, dropped: j.dropped, kept: after.count }
})
log('G97 非法颜色值被服务端丢弃', dropped.status === 200 && dropped.dropped === 1 && dropped.kept === 1,
  JSON.stringify(dropped))

// 收尾：别把测试数据留给后面的用例
await apiJson('/api/graph/colors', { method: 'DELETE' })
await page.evaluate(() => localStorage.removeItem('garden-graph-colors-v2'))

// ================= 三个行为修复（需求 m00991 第 1/2/3 条） =================
await setVp(1440, 900)
await goto('/graph')
await page.waitForFunction(
  () => document.querySelector('[data-testid="graph-canvas"]')?.getAttribute('data-graph-ready') === '1',
  { timeout: 60000 }
).catch(() => {})
await sleep(1500)

/** 挑一个可拖拽的候选节点（未固定、有连接、在画布中间） */
const dragCandidate = () => page.evaluate(() => {
  const box = document.querySelector('[data-testid="graph-canvas"]')?.getBoundingClientRect()
  if (!box) return null
  for (const g of document.querySelectorAll('g.gnode')) {
    const d = g.__data__
    if (!d || d.fx != null || d.isolated || d.degree < 3) continue
    const r = g.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    if (x < box.left + 40 || x > box.right - 40 || y < box.top + 120 || y > box.bottom - 60) continue
    return { id: d.id, title: d.title, x, y }
  }
  return null
})

const dragNode = await dragCandidate()
const posBeforeDrag = await nodeStates()
const pinnedBefore = Object.values(posBeforeDrag).filter(n => n.pinned).length
let dragged = false
if (dragNode) {
  await page.mouse.move(dragNode.x, dragNode.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(dragNode.x + i * 13, dragNode.y + i * 9)
    await sleep(45)
  }
  await page.mouse.up()
  await sleep(700)
  const st = (await nodeStates())[dragNode.id]
  const base = posBeforeDrag[dragNode.id]
  dragged = !!st && !!base && Math.hypot(st.x - base.x, st.y - base.y) > 10
}
const posAfterDrag = await nodeStates()
const pinnedAfter = Object.values(posAfterDrag).filter(n => n.pinned).length
log('G98 节点可拖动，且拖拽不再把节点固定住',
  !!dragNode && dragged && pinnedAfter === pinnedBefore && !posAfterDrag[dragNode ? dragNode.id : '']?.pinned,
  `节点=${dragNode ? dragNode.title : 'no-hit'} 位移生效=${dragged} 固定数 ${pinnedBefore} → ${pinnedAfter}`)

// —— 刷新后位置保持（只有手动「重置位置」才重排） ——
const snap = await nodeStates()
await goto('/graph')
await page.waitForFunction(
  () => document.querySelector('[data-testid="graph-canvas"]')?.getAttribute('data-graph-ready') === '1',
  { timeout: 60000 }
).catch(() => {})
await sleep(2200)
const afterReload = await nodeStates()
const common = Object.keys(snap).filter(id => afterReload[id])
const kept = common.filter(id =>
  Math.abs(afterReload[id].x - snap[id].x) < 1.5 && Math.abs(afterReload[id].y - snap[id].y) < 1.5).length
log('G99 刷新后节点位置保持（不再每次重新布局）',
  common.length > 100 && kept >= common.length * 0.98,
  `可比较 ${common.length} 个节点 · 位置一致 ${kept} 个`)

// —— 只有右键菜单的「固定」才写 fx/fy ——
const pinNode = await dragCandidate()
let pinOk = false
let pinDetail = 'no-hit'
if (pinNode) {
  await page.mouse.click(pinNode.x, pinNode.y, { button: 'right' })
  await sleep(450)
  const kind = await readMenuKind()
  await page.evaluate(() => document.querySelector('[data-testid="graph-menu-pin"]')?.click())
  await sleep(800)
  const st = (await nodeStates())[pinNode.id]
  const hint = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="graph-pin-hint"]')
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null
  })
  pinOk = kind === 'node' && !!st && st.pinned && !!hint
  pinDetail = `菜单=${kind} pinned=${st ? st.pinned : 'null'} 提示=${hint}`
}
log('G100 只有右键「固定」才会固定节点', pinOk, pinDetail)

// 收尾：把刚固定的节点解掉（再点一次菜单里的「固定」即切换），别把固定态留给截图段
if (pinNode) {
  await page.mouse.click(pinNode.x, pinNode.y, { button: 'right' })
  await sleep(450)
  await page.evaluate(() => document.querySelector('[data-testid="graph-menu-pin"]')?.click())
  await sleep(600)
}
await apiJson('/api/graph/colors', { method: 'DELETE' })

// ================= 任意颜色 / rgba（需求 m01619） =================
// 这一段的重点是：颜色不再被 10 个预设色锁死，能挑任意色、能用 rgba 表达半透明。
await apiJson('/api/graph/colors', { method: 'DELETE' })
await setVp(1440, 900)
await goto('/graph')
await page.waitForFunction(
  () => document.querySelector('[data-testid="graph-canvas"]')?.getAttribute('data-graph-ready') === '1',
  { timeout: 60000 }
).catch(() => {})
await sleep(2000)
await page.evaluate(() => localStorage.removeItem('garden-graph-colors-v2'))
await goto('/graph')
await sleep(2200)

/** 在画布中间找一个节点并右键打开菜单；返回命中的候选坐标 */
async function openNodeMenu() {
  const box = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="graph-canvas"]')
    if (!el) return { x: 0, y: 0, w: 0, h: 0 }
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  const hits = await nodeHits()
  const mids = hits.filter(n => n.x > box.x + 24 && n.x < box.x + box.w - 24
    && n.y > box.y + 96 && n.y < box.y + box.h - 80)
  for (const cand of [...mids.filter(n => n.degree >= 3), ...mids, ...hits].slice(0, 12)) {
    await page.mouse.click(cand.x, cand.y, { button: 'right' })
    await sleep(420)
    if (await readMenuKind() === 'node') return cand
  }
  return null
}

/** 在页面里往某个输入框写值并补发事件（Vue 的 v-model / @input 都靠这个驱动） */
const writeInput = (tid, value, kind = 'input') => page.evaluate(({ tid, value, kind }) => {
  const el = document.querySelector(`[data-testid="${tid}"]`)
  if (!el) return false
  el.value = value
  el.dispatchEvent(new Event(kind, { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}, { tid, value, kind })

/**
 * 在自绘控件（调色盘方阵 / 色相条 / 透明度条）上按下并拖动。
 * 这三条不是 <input type=range> 而是手写的指针拖拽，所以只能用真实鼠标事件驱动。
 * fx/fy 是相对控件左上角的比例（0–1）。
 */
const dragOn = async (tid, fx, fy = 0.5) => {
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' })
  }, tid)
  await sleep(120)
  const box = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, tid)
  if (!box || box.w < 2 || box.h < 2) return false
  const x = box.x + box.w * fx
  const y = box.y + box.h * fy
  await page.mouse.move(x, y)
  await page.mouse.down()
  await sleep(50)
  await page.mouse.move(x, y + 1)
  await sleep(50)
  await page.mouse.up()
  await sleep(260)
  return true
}

const PRESETS = ['#E5484D', '#E8730C', '#D4A017', '#46A758', '#12A594', '#0090FF', '#3E63DD', '#8E4EC6', '#D6409F', '#8B8D98']
const isHex6 = (v) => typeof v === 'string' && /^#[0-9A-F]{6}$/.test(v)
const notPreset = (v) => isHex6(v) && !PRESETS.includes(v)
const hexOf = (v) => String(v || '').toUpperCase()
const rgbPrefix = (v) => {
  const m = /^rgba\((\d+), (\d+), (\d+),/.exec(String(v || ''))
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]},` : null
}
const serverColor = () => page.evaluate(async () => {
  const j = await fetch('/api/graph/colors').then(r => r.json())
  const vals = Object.values(j.colors || {})
  return vals[0] || null
})
/** 读调色盘文本框里的当前值：emit 后立刻更新，不像服务端那样要等 600ms 防抖 */
const menuText = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="graph-menu-color-text"]')
  return el ? el.value : null
})

const ccNode = await openNodeMenu()

// —— 菜单里必须出现「调色盘」（饱和度/明度方阵 + 色相条 + 透明度条），而不只是 10 个圆点 ——
const pickerUi = await page.evaluate(() => {
  const ids = [...document.querySelectorAll('[data-testid^="graph-menu-color-"]')]
    .map(e => e.getAttribute('data-testid') || '')
  const box = (tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  }
  const hue = document.querySelector('[data-testid="graph-menu-color-hue"]')
  const alpha = document.querySelector('[data-testid="graph-menu-color-alpha"]')
  return {
    kind: document.querySelector('[data-testid="graph-context-menu"]')?.getAttribute('data-menu-kind'),
    presets: ids.filter(id => /^graph-menu-color-[0-9A-F]{6}$/.test(id)).length,
    sv: box('graph-menu-color-sv'),
    hue: box('graph-menu-color-hue'),
    alpha: box('graph-menu-color-alpha'),
    hueRange: !!hue && Number(hue.getAttribute('aria-valuemax')) === 360,
    alphaRange: !!alpha && Number(alpha.getAttribute('aria-valuemin')) === 5
      && Number(alpha.getAttribute('aria-valuemax')) === 100,
    text: !!document.querySelector('[data-testid="graph-menu-color-text"]'),
    preview: !!document.querySelector('[data-testid="graph-menu-color-preview"]'),
    alphaLabel: !!document.querySelector('[data-testid="graph-menu-color-alpha-label"]')
  }
})
log('G101 右键菜单提供调色盘（饱和度/明度方阵 + 色相条 + 透明度条 + 文本框）',
  pickerUi.kind === 'node' && pickerUi.presets === 10
  && !!pickerUi.sv && pickerUi.sv.w >= 100 && pickerUi.sv.h >= 40
  && !!pickerUi.hue && pickerUi.hue.h >= 8
  && !!pickerUi.alpha && pickerUi.alpha.h >= 8
  && pickerUi.hueRange && pickerUi.alphaRange
  && pickerUi.text && pickerUi.preview && pickerUi.alphaLabel,
  JSON.stringify(pickerUi))

// —— 文本框输入任意非预设色 ——
const CUSTOM_HEX = '#7B3FA0'
await writeInput('graph-menu-color-text', CUSTOM_HEX)
await sleep(1300)
const cc102 = await page.evaluate(async () => {
  const server = await fetch('/api/graph/colors').then(r => r.json())
  const menu = document.querySelector('[data-testid="graph-context-menu"]')
  return {
    count: server.count,
    values: Object.values(server.colors || {}),
    open: !!menu && menu.getAttribute('data-menu-kind') === 'node'
  }
})
log('G102 文本框可设任意色（非预设色），且菜单保持打开',
  !!ccNode && cc102.count === 1 && String(cc102.values[0]).toUpperCase() === CUSTOM_HEX && cc102.open,
  `节点=${ccNode ? ccNode.title : 'no-hit'} 服务端=${JSON.stringify(cc102.values)} 菜单开着=${cc102.open}`)

// —— 调色盘（色相条）能调出预设色板之外的任意色 ——
// 注意：读值走文本框（emit 后立刻更新），服务端要等 600ms 防抖才落库，拖完马上查会读到旧值。
await dragOn('graph-menu-color-hue', 0.1)
const hueA = await menuText()
await dragOn('graph-menu-color-hue', 0.85)
const hueB = await menuText()
log('G103a 拖动色相条可选出任意色（不限于预设色板）',
  notPreset(hueA) && notPreset(hueB) && hexOf(hueA) !== hexOf(hueB) && hexOf(hueB) !== CUSTOM_HEX,
  `色相 10%→${hueA} · 85%→${hueB}（预设是固定的 10 个色）`)

// —— 方阵的横轴是饱和度、纵轴是明度 ——
await dragOn('graph-menu-color-sv', 0.92, 0.12)
const svA = await menuText()
await dragOn('graph-menu-color-sv', 0.08, 0.88)
const svB = await menuText()
await sleep(1300)
log('G103b 拖动方阵可调饱和度与明度',
  notPreset(svA) && notPreset(svB) && hexOf(svA) !== hexOf(svB) && hexOf(await serverColor()) === hexOf(svB),
  `右上（高饱和/高明度）→${svA} · 左下（低饱和/低明度）→${svB} · 服务端=${await serverColor()}`)

// —— 透明度条 → rgba 落库（下限 5%，所以比例要按 (a-0.05)/0.95 映射）——
await dragOn('graph-menu-color-alpha', (0.4 - 0.05) / 0.95)
await sleep(1300)
const cc103 = await page.evaluate(async () => {
  const server = await fetch('/api/graph/colors').then(r => r.json())
  const txt = (t) => {
    const el = document.querySelector(`[data-testid="graph-menu-color-${t}"]`)
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null
  }
  const preview = document.querySelector('[data-testid="graph-menu-color-preview"]')
  const text = document.querySelector('[data-testid="graph-menu-color-text"]')
  return {
    value: Object.values(server.colors || {})[0] || null,
    label: txt('alpha-label'),
    text: text ? text.value : null,
    preview: preview ? preview.style.background : null
  }
})
const cc103Alpha = Number((/^rgba\(\d+, \d+, \d+, ([\d.]+)\)$/.exec(String(cc103.value)) || [])[1])
log('G103 拖动透明度条写出 rgba 并落库',
  Number.isFinite(cc103Alpha) && Math.abs(cc103Alpha - 0.4) <= 0.06
  && cc103.label === `${Math.round(cc103Alpha * 100)}%`
  && String(cc103.text).startsWith('rgba(')
  && String(cc103.preview).startsWith(String(rgbPrefix(cc103.value))),
  JSON.stringify(cc103))

// —— 半透明色要真的画到图上（缩略图圆点用的是同一个值） ——
await sleep(1600)
const cc104 = await page.evaluate((prefix) => {
  const fills = [...document.querySelectorAll('circle.mm-dot')].map(c => c.getAttribute('fill') || '')
  return {
    dots: fills.length,
    rgba: fills.filter(f => f.startsWith(prefix)).length,
    hint: (document.querySelector('[data-testid="graph-color-count"]') || {}).textContent || ''
  }
}, rgbPrefix(cc103.value))
log('G104 半透明色已绘制到缩略图',
  cc104.rgba >= 1,
  `缩略图点 ${cc104.dots} 个 · 命中 ${rgbPrefix(cc103.value)}… 的 ${cc104.rgba} 个 · 颜色计数「${cc104.hint.trim()}」`)

// —— 非法写法要被挡住，且不能污染已存颜色 ——
await writeInput('graph-menu-color-text', 'javascript:alert(1)')
await sleep(900)
const cc105 = await page.evaluate(async () => {
  const hint = document.querySelector('[data-testid="graph-menu-color-hint"]')
  const label = document.querySelector('[data-testid="graph-menu-color-alpha-label"]')
  const server = await fetch('/api/graph/colors').then(r => r.json())
  return {
    hint: hint ? (hint.textContent || '').replace(/\s+/g, ' ').trim() : null,
    label: label ? (label.textContent || '').trim() : null,
    value: Object.values(server.colors || {})[0] || null
  }
})
log('G105 非法颜色写法被拒且不影响已存颜色',
  !!cc105.hint && cc105.value === cc103.value
  && cc105.label === `${Math.round(cc103Alpha * 100)}%`,
  `提示=${cc105.hint ? cc105.hint.slice(0, 18) : 'null'} 服务端=${cc105.value} 透明度=${cc105.label}`)

// —— 回到不透明 hex：提示消失、透明度回满 ——
await writeInput('graph-menu-color-text', '#3E63DD')
await sleep(1300)
const cc106 = await page.evaluate(async () => {
  const hint = document.querySelector('[data-testid="graph-menu-color-hint"]')
  const label = document.querySelector('[data-testid="graph-menu-color-alpha-label"]')
  const server = await fetch('/api/graph/colors').then(r => r.json())
  return {
    hint: !!hint,
    label: label ? (label.textContent || '').trim() : null,
    value: Object.values(server.colors || {})[0] || null
  }
})
log('G106 改回不透明 hex 后提示消失、透明度回满',
  !cc106.hint && cc106.label === '100%' && String(cc106.value).toUpperCase() === '#3E63DD',
  JSON.stringify(cc106))

// —— 服务端放行 rgba / 简写 hex，拒绝注入型字符串 ——
const apiColors = await page.evaluate(async () => {
  const r = await fetch('/api/graph/colors', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      colors: {
        'a/ok.md': 'rgba(18, 52, 86, 0.55)',
        'a/ok2.md': '#abc',
        'a/ok3.md': 'hsl(160 56% 40%)',
        'a/bad.md': 'rgb(0,0,0);background:url(x)',
        'a/bad2.md': 'rgb(0,0)'
      }
    })
  })
  const j = await r.json()
  const after = await fetch('/api/graph/colors').then(x => x.json())
  return { status: r.status, count: j.count, dropped: j.dropped, colors: after.colors }
})
log('G107 服务端放行 rgba / 简写 hex / 空格语法 hsl，拒绝注入串',
  apiColors.status === 200 && apiColors.dropped === 2 && apiColors.count === 3
  && apiColors.colors['a/ok.md'] === 'rgba(18, 52, 86, 0.55)'
  && apiColors.colors['a/ok2.md'] === '#abc'
  && apiColors.colors['a/ok3.md'] === 'hsl(160 56% 40%)',
  JSON.stringify(apiColors))

await apiJson('/api/graph/colors', { method: 'DELETE' })
await page.evaluate(() => localStorage.removeItem('garden-graph-colors-v2'))

// —— 颜色规则面板同样要能挑任意色 ——
await apiJson('/api/graph/color-rules', { method: 'DELETE' })
await page.evaluate(() => localStorage.removeItem('garden-graph-color-rules-v1'))
await goto('/graph')
await sleep(2600)
await scrollRules()
await writeInput('graph-rule-color-text', 'rgba(18, 52, 86, 0.55)')
await sleep(300)
await writeInput('graph-rule-value', 'KnowledgeBase')
await sleep(900)
await page.evaluate(() => document.querySelector('[data-testid="graph-rule-submit"]')?.click())
await sleep(1500)
const ruleRgba = await page.evaluate(async () => {
  const j = await fetch('/api/graph/color-rules').then(r => r.json())
  const custom = (j.rules || []).filter(r => /^rgba\(/.test(r.color))
  const uniq = new Set((j.rules || []).map(r => r.color))
  return {
    count: j.count,
    customCount: custom.length,
    color: custom[0] ? custom[0].color : null,
    field: custom[0] ? custom[0].field : null,
    distinctColors: uniq.size
  }
})
log('G108 颜色规则也能用任意 rgba 颜色',
  ruleRgba.customCount === 1 && ruleRgba.color === 'rgba(18, 52, 86, 0.55)' && ruleRgba.field === 'path',
  JSON.stringify(ruleRgba))

// —— 规则行内编辑同样能改透明度 ——
const rgbaRuleId = await page.evaluate(async () => {
  const j = await fetch('/api/graph/color-rules').then(r => r.json())
  const r = (j.rules || []).find(x => /^rgba\(/.test(x.color))
  return r ? r.id : null
})
let editAlphaOk = false
let editAlphaDetail = '未找到目标规则'
if (rgbaRuleId) {
  await scrollRules()
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-swatch-${rgbaRuleId}"]`)
  await sleep(300)
  // 透明度条是自绘的，得用指针拖（目标 0.8：比例 (0.8-0.05)/0.95）
  await dragOn(`graph-rule-edit-color-${rgbaRuleId}-alpha`, (0.8 - 0.05) / 0.95)
  await sleep(1200)
  await page.evaluate((q) => document.querySelector(q)?.click(), `[data-testid="graph-rule-edit-done-${rgbaRuleId}"]`)
  await sleep(1500)
  const edited = await page.evaluate(async (id) => {
    const j = await fetch('/api/graph/color-rules').then(r => r.json())
    const r = (j.rules || []).find(x => x.id === id)
    return r ? r.color : null
  }, rgbaRuleId)
  const editedAlpha = Number((/^rgba\(18, 52, 86, ([\d.]+)\)$/.exec(String(edited)) || [])[1])
  editAlphaOk = Number.isFinite(editedAlpha) && Math.abs(editedAlpha - 0.8) <= 0.06
  editAlphaDetail = `0.55 → ${edited}`
}
log('G109 规则行内编辑可调透明度', editAlphaOk, editAlphaDetail)

// 收尾：别把测试数据留给后面的用例。
// 只在快照成功（非 null）时才删——快照失败意味着读不到用户原有配色，宁可留下测试数据，也不能误删。
if (colorBackup.rules !== null) await apiJson('/api/graph/color-rules', { method: 'DELETE' })
if (colorBackup.colors !== null) await apiJson('/api/graph/colors', { method: 'DELETE' })
await page.evaluate(() => {
  localStorage.removeItem('garden-graph-color-rules-v1')
  localStorage.removeItem('garden-graph-colors-v2')
})

// —— 把跑测试前用户的配色原样放回去（没有就保持干净） ——
const restoreColors = colorBackup.colors && Object.keys(colorBackup.colors).length
  ? await apiJson('/api/graph/colors', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ colors: colorBackup.colors })
    })
  : null
let restoreRules = null
if (colorBackup.rules && colorBackup.rules.updatedAt !== null) {
  restoreRules = await apiJson('/api/graph/color-rules', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rules: colorBackup.rules.rules || [] })
  })
}
log('G110 验收跑完后还原用户原有配色（自定义色 / 颜色规则）',
  (restoreColors === null || restoreColors.ok === true) && (restoreRules === null || restoreRules.ok === true),
  `自定义色 ${colorBackup.colors ? Object.keys(colorBackup.colors).length : 0} 条 · 规则 ${colorBackup.rules && colorBackup.rules.updatedAt !== null ? (colorBackup.rules.rules || []).length : '未保存过'} 条`)

// ================= 控制台洁净 =================
const benign = /ResizeObserver loop|favicon|Download the Vue Devtools/i
const realErrors = consoleErrors.filter(t => !benign.test(t))
log('G41 无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' || '))
log('G42 无 console.error', realErrors.length === 0, realErrors.slice(0, 2).join(' || '))

// ================= 截图留档（桌面 / 平板 / 手机） =================
try {
  const { mkdirSync } = await import('node:fs')
  mkdirSync(OUT, { recursive: true })
  for (const [w, h, name] of [[1440, 900, 'graph-1440'], [1024, 768, 'graph-1024'], [390, 844, 'graph-390']]) {
    await setVp(w, h)
    await goto('/graph')
    await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: false })
  }
  console.log(`[graph-verify] 截图已写入 ${OUT}`)
} catch (e) {
  console.log('[graph-verify] 截图跳过：' + String(e).slice(0, 120))
}

// —— 截图会反复 goto('/graph')，而客户端在「规则从未保存过」（服务端 updatedAt === null）时
//    会自动播种 10 条默认规则并回推服务端；所以最终还原必须在一个**没有前端应用**的同源页面
//    （静态资源）上做，否则刚删掉的规则行会被前端立刻写回来。
//    这里先跳到 /favicon.ico 让 /graph 的 beforeunload flush 落完，再按快照的精确状态还原。 ——
await page.goto('/favicon.ico', { waitUntil: 'domcontentloaded' }).catch(() => {})
await sleep(600)
const finalize = await page.evaluate(async (backup) => {
  const put = (p, body) => fetch(p, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json()).catch(() => null)
  const del = p => fetch(p, { method: 'DELETE' }).then(r => r.json()).catch(() => null)
  const out = {}
  if (backup.colors === null) out.colors = 'skipped'
  else if (Object.keys(backup.colors).length) out.colors = await put('/api/graph/colors', { colors: backup.colors })
  else out.colors = await del('/api/graph/colors')
  if (backup.rules === null) out.rules = 'skipped'
  else if (backup.rules.updatedAt !== null) out.rules = await put('/api/graph/color-rules', { rules: backup.rules.rules || [] })
  else out.rules = await del('/api/graph/color-rules')
  return out
}, colorBackup)

// 最终回读（这是对「不吞用户数据」的最终保险）
const restoredFinal = await page.evaluate(async () => {
  const c = await fetch('/api/graph/colors').then(r => r.json()).catch(() => null)
  const r = await fetch('/api/graph/color-rules').then(r => r.json()).catch(() => null)
  return { colors: c ? c.colors : null, rules: r ? (r.rules || []).map(x => x.id) : null, rulesSaved: r ? r.updatedAt !== null : null }
})
const wantColors = colorBackup.colors ? Object.keys(colorBackup.colors).length : 0
const wantRulesSaved = !!(colorBackup.rules && colorBackup.rules.updatedAt !== null)
log('G111 还原后的配色在整套跑完（含多次跳转）后仍在',
  restoredFinal.colors !== null && Object.keys(restoredFinal.colors).length === wantColors
  && restoredFinal.rulesSaved === wantRulesSaved
  && (!wantRulesSaved || restoredFinal.rules.length === (colorBackup.rules.rules || []).length),
  `自定义色 ${Object.keys(restoredFinal.colors || {}).length}/${wantColors} · 规则 ${restoredFinal.rules ? restoredFinal.rules.length : 'null'}/${wantRulesSaved ? (colorBackup.rules.rules || []).length : '未保存过'} · finalize=${JSON.stringify(finalize)}`)

await browser.close()

const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`\n[graph-verify] ${results.length - failed.length}/${results.length} 通过 · 截图目录 ${OUT}`)
if (failed.length) {
  console.log('[graph-verify] 失败项：')
  for (const f of failed) console.log('  ' + f)
}
process.exit(failed.length ? 1 : 0)
