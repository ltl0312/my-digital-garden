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
        title: d ? d.title : ''
      }
    })
    .filter(n => Number.isFinite(n.x) && Number.isFinite(n.y) && n.x > 0 && n.y > 0 && !n.pinned)
})

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

await browser.close()

const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`\n[graph-verify] ${results.length - failed.length}/${results.length} 通过 · 截图目录 ${OUT}`)
if (failed.length) {
  console.log('[graph-verify] 失败项：')
  for (const f of failed) console.log('  ' + f)
}
process.exit(failed.length ? 1 : 0)
