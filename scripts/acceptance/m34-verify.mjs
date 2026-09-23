// 阶段 M3 + M4 验收：列表行/结构树长按面板 · 对话框底部弹层 · 详情页顶栏插槽与目录抽屉 ·
// 图谱底部折叠面板 · 后台密钥卡片化。
// 用法：node .workbuddy/backups/m34-verify.mjs
import { resolve } from 'node:path'
import fs from 'node:fs/promises'
// 共享配置：目标地址 / 登录凭据 / 浏览器与 puppeteer-core 位置（见 ./_env.mjs 与 README.md）
import { BASE, ROOT_KEY, CHROME, PROJECT_ROOT, loadPuppeteer } from './_env.mjs'

const puppeteer = await loadPuppeteer()

if (!ROOT_KEY) {
  console.error('[acceptance] 缺少登录密钥：请在仓库根目录创建 .env.acceptance（模板见 scripts/acceptance/.env.acceptance.example），或设置环境变量 GARDEN_ROOT_KEY。')
  process.exit(1)
}

const OUT = resolve(PROJECT_ROOT, '.workbuddy/backups/m34-shots')
await fs.mkdir(OUT, { recursive: true })

const results = []
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const page = await browser.newPage()

const consoleIssues = []
page.on('console', (m) => {
  const t = m.type()
  if (t === 'error' || t === 'warning') consoleIssues.push(`[${t}] ${m.text()}`)
})
page.on('pageerror', (e) => consoleIssues.push(`[pageerror] ${e.message}`))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- 辅助 ----
const vis = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return false
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 0 && r.height > 0
}, sel)

const box = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}, sel)

const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent || '', sel)
const vh = () => page.evaluate(() => window.innerHeight)

const noHScroll = () => page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1 &&
  document.body.scrollWidth <= window.innerWidth + 1)

const clickDom = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) throw new Error('not found: ' + s)
  el.click()
}, sel)

const clickInMenu = (label) => page.evaluate((t) => {
  const btn = Array.from(document.querySelectorAll('[role="menu"] button'))
    .find((b) => (b.textContent || '').includes(t))
  if (!btn) throw new Error('menu item not found: ' + t)
  btn.click()
}, label)

/** 触屏长按：pointerdown → 等 hold ms → pointerup（真实触摸的事件序列） */
const longPress = (sel, hold = 660) => page.evaluate(async (s, h) => {
  const el = document.querySelector(s)
  if (!el) throw new Error('longpress target not found: ' + s)
  const r = el.getBoundingClientRect()
  const init = {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, isPrimary: true, buttons: 1,
    clientX: r.left + 30, clientY: Math.max(8, Math.min(r.top + 20, window.innerHeight - 40))
  }
  el.dispatchEvent(new PointerEvent('pointerdown', init))
  await new Promise((res) => setTimeout(res, h))
  el.dispatchEvent(new PointerEvent('pointerup', init))
}, sel, hold)

/** 触屏短按：按下即抬起 + 补发 click（等价于用户点了一下） */
const tap = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) throw new Error('tap target not found: ' + s)
  const r = el.getBoundingClientRect()
  const init = {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, isPrimary: true, buttons: 1,
    clientX: r.left + 30, clientY: r.top + 20
  }
  el.dispatchEvent(new PointerEvent('pointerdown', init))
  el.dispatchEvent(new PointerEvent('pointerup', init))
  el.click()
}, sel)

const sheetOpen = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="sheet"]')
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.height > 40 && r.width > 100
})

// ---- 登录（root） ----
await page.setViewport({ width: 390, height: 844 })
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 })
await page.type('input[type="password"]', ROOT_KEY)
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button')).find((e) => (e.textContent || '').includes('进入花园'))
  if (!b) throw new Error('login button not found')
  b.click()
})
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 60000 })

// ================= A. 390 · 列表行长按操作面板（M3 / 第 22 屏）=================
await page.goto(BASE + '/notes', { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-testid="note-row"]'), { timeout: 30000 })
await wait(300)

const firstHref = await page.evaluate(() => document.querySelector('[data-testid="note-row"]')?.getAttribute('href') || '')
ok('390 · 列表行已渲染', !!firstHref, firstHref)

await longPress('[data-testid="note-row"]')
await wait(250)
ok('390 · 长按列表行唤起底部面板', await sheetOpen())

const sheetTxt = await text('[data-testid="sheet"]')
ok('390 · 面板含四项操作', ['复制笔记链接', '复制文件路径', '在结构树中定位', '删除笔记'].every((t) => sheetTxt.includes(t)),
  sheetTxt.replace(/\s+/g, ' ').slice(0, 90))

// 长按松手后浏览器会补发一次 click，用它验证「唤起面板的同时不会打开笔记」
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="note-row"]')
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
})
await wait(300)
ok('390 · 长按后不误触导航（click 被吞）', page.url().endsWith('/notes'), page.url())

await page.screenshot({ path: resolve(OUT, '390-note-sheet.png') })

await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('[data-testid="sheet"] button'))
    .find((e) => (e.textContent || '').trim() === '取消')
  if (b) b.click()
})
await wait(400)
ok('390 · 取消可关闭面板', !(await sheetOpen()))

// 回归：短按仍应正常打开笔记
await tap('[data-testid="note-row"]')
await page.waitForFunction((h) => decodeURIComponent(location.pathname) === decodeURIComponent(h), { timeout: 25000 }, firstHref)
ok('390 · 短按仍能打开笔记（长按未破坏点击）', true, decodeURIComponent(page.url()).replace(BASE, ''))

// ================= B. 390 · 详情页顶栏插槽 + 目录抽屉 + 更多面板（M4 / 第 04、19 屏）=====
await wait(500)
const headerBtns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#shell-header-actions button')).map((b) => b.getAttribute('title')))
ok('390 · 详情页顶栏注入「目录」「更多」', headerBtns.includes('目录与属性') && headerBtns.includes('更多操作'), headerBtns.join(' / '))

await clickDom('#shell-header-actions button[title="目录与属性"]')
await wait(400)
ok('390 · 目录抽屉可打开', await sheetOpen())
const tocTxt = await text('[data-testid="sheet"]')
ok('390 · 目录抽屉含阅读进度与属性（<1280 目录不再丢失）',
  tocTxt.includes('已读') && tocTxt.includes('属性'), tocTxt.replace(/\s+/g, ' ').slice(0, 90))
await page.screenshot({ path: resolve(OUT, '390-toc-sheet.png') })

await clickDom('[data-testid="sheet"] button[aria-label="关闭"]')
await wait(400)
ok('390 · 目录抽屉可关闭', !(await sheetOpen()))

await clickDom('#shell-header-actions button[title="更多操作"]')
await wait(400)
const moreTxt = await text('[data-testid="sheet"]')
ok('390 · 更多面板含编辑与删除', moreTxt.includes('编辑笔记') && moreTxt.includes('删除笔记'),
  moreTxt.replace(/\s+/g, ' ').slice(0, 90))
await page.screenshot({ path: resolve(OUT, '390-more-sheet.png') })
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('[data-testid="sheet"] button'))
    .find((e) => (e.textContent || '').trim() === '取消')
  if (b) b.click()
})
await wait(400)

// ================= C. 390 · 结构树长按面板（M3 / 第 09 屏）=================
await clickDom('header button[title="打开侧栏"]')
await wait(500)
ok('390 · 侧栏抽屉已打开', await vis('[data-tree-path]'))

const treePath = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('[data-tree-path]'))
  const el = els.find((e) => (e.dataset.treePath || '').includes('/')) || els[0]
  return el ? el.dataset.treePath : ''
})
await longPress('[data-tree-path]')
await wait(300)
const treeSheetTxt = await text('[data-testid="sheet"]')
ok('390 · 长按结构树行唤起同一面板', (await sheetOpen()) && treeSheetTxt.includes('复制路径'),
  `${treePath} → ${treeSheetTxt.replace(/\s+/g, ' ').slice(0, 70)}`)
await page.screenshot({ path: resolve(OUT, '390-tree-sheet.png') })
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('[data-testid="sheet"] button'))
    .find((e) => (e.textContent || '').trim() === '取消')
  if (b) b.click()
})
await wait(400)
await clickDom('header button[title="打开侧栏"]')
await wait(400)

// ================= D. 390 · 对话框底部弹层化（M4 / 第 11、12、13 屏）=================
await page.goto(BASE + '/notes', { waitUntil: 'networkidle2', timeout: 60000 })
await wait(400)
await clickDom('header button[title="新建"]')
await wait(250)
await clickInMenu('新建笔记')
await wait(500)
ok('390 · 新建笔记对话框出现', await vis('[data-testid="app-dialog"]'))
ok('390 · 列表页保留 FAB', await vis('[data-testid="app-fab"]'))

const dlg = await box('[data-testid="app-dialog"]')
const H = await vh()
ok('390 · 对话框贴底（底部弹层形态）', !!dlg && Math.abs(dlg.bottom - H) <= 2,
  dlg ? `bottom=${dlg.bottom.toFixed(1)} vh=${H}` : 'null')

const radius = await page.evaluate(() =>
  getComputedStyle(document.querySelector('[data-testid="app-dialog"]')).borderTopLeftRadius)
ok('390 · 上圆角 24px', radius === '24px', radius)

const btnW = await page.evaluate(() => {
  const d = document.querySelector('[data-testid="app-dialog"]')
  const btns = Array.from(d.querySelectorAll('footer button'))
  if (!btns.length) return null
  const inner = d.getBoundingClientRect().width - 40 // 减去 footer 的 px-5（左右各 20）
  return {
    inner,
    widths: btns.map((b) => b.getBoundingClientRect().width),
    tops: btns.map((b) => b.getBoundingClientRect().top)
  }
})
// 拉通 = 每个按钮都撑满内容区；堆叠 = 各按钮左边缘一致（纵向排列）
ok('390 · 页脚按钮拉通并堆叠（拇指可达）',
  !!btnW && btnW.widths.every((w) => w / btnW.inner > 0.95) && new Set(btnW.tops).size === btnW.tops.length,
  btnW ? `inner=${btnW.inner.toFixed(0)} widths=${btnW.widths.map((w) => w.toFixed(0)).join(',')}` : 'null')
await page.screenshot({ path: resolve(OUT, '390-dialog-sheet.png') })

await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('[data-testid="app-dialog"] button'))
    .find((e) => (e.textContent || '').trim() === '取消')
  if (b) b.click()
})
await wait(400)

// ================= E. 390 · 图谱底部折叠面板（M4 / 第 06 屏）=================
await page.goto(BASE + '/graph', { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-testid="graph-panel-toggle"]'), { timeout: 30000 })
await wait(600)
ok('390 · 底部面板可见', await vis('[data-testid="graph-panel-toggle"]'))
ok('390 · 图谱页无 FAB（底部让位给折叠面板）', !(await vis('[data-testid="app-fab"]')))
ok('390 · 原左下图例 / 右下统计已隐藏',
  !(await vis('[data-testid="graph-legend"]')) && !(await vis('[data-testid="graph-stats"]')))

await clickDom('[data-testid="graph-panel-toggle"]')
await wait(400)
const gpTxt = await page.evaluate(() => {
  const t = document.querySelector('[data-testid="graph-panel-toggle"]')
  return t ? t.parentElement.textContent || '' : ''
})
ok('390 · 展开后含图例与统计', gpTxt.includes('图例') && gpTxt.includes('统计') && gpTxt.includes('节点'),
  gpTxt.replace(/\s+/g, ' ').slice(0, 90))
await page.screenshot({ path: resolve(OUT, '390-graph-panel.png') })

// ================= F. 390 · 后台密钥卡片化（M4 / 第 08 屏）=================
await page.goto(BASE + '/admin', { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-testid="key-cards"]'), { timeout: 30000 })
await wait(400)
ok('390 · 密钥卡片列表可见', await vis('[data-testid="key-cards"]'))
ok('390 · 表格已隐藏', !(await vis('[data-testid="key-table"]')))

const cardTxt = await text('[data-testid="key-cards"]')
ok('390 · 卡片保留全部列信息',
  ['创建者', '最近使用'].every((t) => cardTxt.includes(t)) &&
  (cardTxt.includes('启用') || cardTxt.includes('已禁用')) &&
  (cardTxt.includes('初始管理员') || cardTxt.includes('普通管理员') || cardTxt.includes('普通用户')),
  cardTxt.replace(/\s+/g, ' ').slice(0, 100))
ok('390 · 无横向滚动', await noHScroll())
ok('390 · 非详情页顶栏插槽为空（Teleport 已随页面卸载）', await page.evaluate(() => {
  const s = document.querySelector('#shell-header-actions')
  return !!s && s.children.length === 0
}))
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="key-cards"]')
  el?.scrollIntoView({ block: 'start' })
})
await wait(400)
await page.screenshot({ path: resolve(OUT, '390-admin-cards.png') })

// ================= G. 1440 · 桌面形态未被破坏 =================
await page.setViewport({ width: 1440, height: 900 })

await page.goto(BASE + '/admin', { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-testid="key-table"]'), { timeout: 30000 })
await wait(300)
ok('1440 · 密钥表格可见', await vis('[data-testid="key-table"]'))
ok('1440 · 密钥卡片列表已隐藏', !(await vis('[data-testid="key-cards"]')))

await page.goto(BASE + '/graph', { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-testid="graph-legend"]'), { timeout: 30000 })
await wait(400)
ok('1440 · 图例与统计浮层可见',
  (await vis('[data-testid="graph-legend"]')) && (await vis('[data-testid="graph-stats"]')))
ok('1440 · 底部折叠面板已隐藏', !(await vis('[data-testid="graph-panel-toggle"]')))

await page.goto(BASE + '/notes', { waitUntil: 'networkidle2', timeout: 60000 })
await wait(400)
await clickDom('header button[title="新建"]')
await wait(250)
await clickInMenu('新建笔记')
await wait(500)
const dlg2 = await box('[data-testid="app-dialog"]')
const H2 = await vh()
ok('1440 · 对话框为居中卡片（非贴底）', !!dlg2 && dlg2.bottom < H2 - 40,
  dlg2 ? `bottom=${dlg2.bottom.toFixed(1)} vh=${H2}` : 'null')
const radius2 = await page.evaluate(() =>
  getComputedStyle(document.querySelector('[data-testid="app-dialog"]')).borderTopLeftRadius)
ok('1440 · 圆角回落到桌面档（非 24px）', radius2 !== '24px', radius2)
ok('1440 · 页脚按钮不拉通', await page.evaluate(() => {
  const d = document.querySelector('[data-testid="app-dialog"]')
  const b = d.querySelector('footer button')
  return b ? b.getBoundingClientRect().width / d.getBoundingClientRect().width < 0.5 : false
}))
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('[data-testid="app-dialog"] button'))
    .find((e) => (e.textContent || '').trim() === '取消')
  if (b) b.click()
})
await wait(400)

// 鼠标长按不应触发面板（桌面保持右键菜单）
const el = await page.$('[data-testid="note-row"]')
await el.hover()
await page.mouse.down()
await wait(750)
await page.mouse.up()
await wait(250)
ok('1440 · 鼠标长按不唤起面板（桌面走右键菜单）', !(await sheetOpen()))

// 详情页：桌面沿用页内操作行，顶栏插槽隐藏
await page.goto(BASE + firstHref, { waitUntil: 'networkidle2', timeout: 60000 })
await wait(500)
ok('1440 · 顶栏插槽容器隐藏（sm:hidden）', !(await vis('#shell-header-actions')))
ok('1440 · 详情页页内「更多操作」可见', await page.evaluate(() =>
  Array.from(document.querySelectorAll('main button')).some((b) => b.getAttribute('title') === '更多操作')))

// ================= H. 1023 · 平板：目录入口存在、底部导航让位 =================
await page.setViewport({ width: 1023, height: 900 })
await page.goto(BASE + firstHref, { waitUntil: 'networkidle2', timeout: 60000 })
await wait(500)
ok('1023 · 页内「目录」入口存在（<1280 目录不丢）', await page.evaluate(() =>
  Array.from(document.querySelectorAll('main button')).some((b) => (b.textContent || '').trim() === '目录')))
ok('1023 · 底部 TabBar 隐藏（交回抽屉形态）', !(await vis('[data-testid="bottom-tabbar"]')))
ok('1023 · 顶栏插槽隐藏（≥640）', !(await vis('#shell-header-actions')))
ok('1023 · 无横向滚动', await noHScroll())

// ---- 控制台问题 ----
const hydration = consoleIssues.filter((s) => /hydrat|mismatch/i.test(s))
ok('无 hydration mismatch', hydration.length === 0, hydration.slice(0, 3).join(' || ') || 'none')
const errs = consoleIssues.filter((s) => /\[error\]|\[pageerror\]/.test(s))
ok('无控制台 error', errs.length === 0, errs.slice(0, 3).join(' || ') || 'none')

await fs.writeFile(resolve(OUT, '_report.json'), JSON.stringify({ results, consoleIssues }, null, 2))
const pass = results.filter((r) => r.pass).length
console.log(`\n==== ${pass}/${results.length} PASS ====`)
if (consoleIssues.length) {
  console.log('\n控制台输出（前 20 条）：')
  consoleIssues.slice(0, 20).forEach((s) => console.log('  ' + s.slice(0, 220)))
}
await browser.close()
process.exit(pass === results.length ? 0 : 1)
