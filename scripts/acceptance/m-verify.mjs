// 阶段 M2 验收：移动端外壳（底部 TabBar / FAB / 顶栏吸顶与滚动联动 / 抽屉宽度公式 / 编辑态让位）
// 用法：node .workbuddy/backups/m-verify.mjs
import { resolve } from 'node:path'
import fs from 'node:fs/promises'
// 共享配置：目标地址 / 登录凭据 / 浏览器与 puppeteer-core 位置（见 ./_env.mjs 与 README.md）
import { BASE, ROOT_KEY, CHROME, PROJECT_ROOT, loadPuppeteer } from './_env.mjs'

const puppeteer = await loadPuppeteer()

if (!ROOT_KEY) {
  console.error('[acceptance] 缺少登录密钥：请在仓库根目录创建 .env.acceptance（模板见 scripts/acceptance/.env.acceptance.example），或设置环境变量 GARDEN_ROOT_KEY。')
  process.exit(1)
}

const OUT = resolve(PROJECT_ROOT, '.workbuddy/backups/m-shots')
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

const noHScroll = () => page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1 &&
  document.body.scrollWidth <= window.innerWidth + 1)

const clickDom = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) throw new Error('not found: ' + s)
  el.click()
}, sel)

const clickByText = (sel, text) => page.evaluate((s, t) => {
  const el = Array.from(document.querySelectorAll(s)).find((e) => e.textContent.includes(t))
  if (!el) throw new Error('not found by text: ' + t)
  el.click()
}, sel, text)

const scrollMain = (y) => page.evaluate((v) => {
  const el = document.querySelector('[data-scroll-root]')
  if (!el) throw new Error('no scroll root')
  el.scrollTop = v
  el.dispatchEvent(new Event('scroll'))
}, y)

// ---- 登录（root） ----
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 })
await page.type('input[type="password"]', ROOT_KEY)
await clickByText('button', '进入花园')
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-scroll-root]'), { timeout: 30000 })
ok('登录成功并进入应用外壳', true)

// ================= A. 手机 390×844 =================
await page.setViewport({ width: 390, height: 844 })
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-testid="bottom-tabbar"]'), { timeout: 30000 })

ok('390 · 底部 TabBar 可见', await vis('[data-testid="bottom-tabbar"]'))
ok('390 · FAB 可见', await vis('[data-testid="app-fab"]'))
ok('390 · 图标栏隐藏', !(await vis('nav[aria-label="主导航"]')))
ok('390 · 汉堡按钮可见', await vis('header button[title="打开侧栏"]'))
ok('390 · 无横向滚动', await noHScroll())

const tb = await box('[data-testid="bottom-tabbar"]')
const fab = await box('[data-testid="app-fab"]')
ok('390 · TabBar 贴底', tb && Math.abs(tb.bottom - 844) < 2, tb ? `bottom=${tb.bottom.toFixed(1)}` : 'null')
ok('390 · TabBar 高度 ≈ 95', tb && Math.abs(tb.h - 95) < 8, tb ? `h=${tb.h.toFixed(1)}` : 'null')
ok('390 · FAB 不与 TabBar 重叠', !!(fab && tb && fab.bottom <= tb.top + 0.5), fab && tb ? `fab.bottom=${fab.bottom.toFixed(1)} tabbar.top=${tb.top.toFixed(1)}` : 'null')

const tabCount = await page.evaluate(() => document.querySelectorAll('[data-testid="bottom-tabbar"] a').length)
ok('390 · TabBar 条目数 = 4（首页/笔记/图谱/后台）', tabCount === 4, `count=${tabCount}`)
const tabLabels = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-testid="bottom-tabbar"] a')).map((a) => a.textContent.trim()))
ok('390 · TabBar 文案', JSON.stringify(tabLabels) === JSON.stringify(['首页', '笔记', '图谱', '后台']), tabLabels.join(' / '))

// 吸顶：滚动后顶栏仍在视口顶部
const h0 = await box('header')
await scrollMain(500)
await new Promise((r) => setTimeout(r, 250))
const h1 = await box('header')
ok('390 · 顶栏吸顶（滚动后 top 不变且贴顶）', !!(h0 && h1 && Math.abs(h0.top) < 1 && Math.abs(h1.top) < 1), `before=${h0?.top} after=${h1?.top}`)
ok('390 · 滚动后底边分隔线出现', await page.evaluate(() => {
  const h = document.querySelector('header')
  return h ? getComputedStyle(h).borderBottomColor !== 'rgba(0, 0, 0, 0)' : false
}))
await page.screenshot({ path: resolve(OUT, '390-home-scrolled.png') })

// FAB 滚动隐藏 / 向上回归
// 断言「目标态」而非动画中间态：class 上的 pointer-events-none 是离散开关，
// 不受 200ms 过渡影响；等待窗口取 150ms（< 300ms 空闲回归阈值）避免与空闲计时器竞态。
//
// 必须先复位到 0 再向下滚 —— 规则是「**向下位移**才隐藏」（非向下位移一律视为回归），
// 所以从 500 再设 500 属于无位移，FAB 本就该保持可见。这是产品行为，不是缺陷。
const fabHiddenState = () => page.evaluate(() => {
  const b = document.querySelector('[data-testid="app-fab"] button')
  return b ? b.className.includes('pointer-events-none') : null
})
await scrollMain(0)
await new Promise((r) => setTimeout(r, 320))
await scrollMain(600)
await new Promise((r) => setTimeout(r, 150))
ok('390 · 向下滚动后 FAB 进入隐藏态', (await fabHiddenState()) === true)
await scrollMain(200)
await new Promise((r) => setTimeout(r, 150))
ok('390 · 向上滚动后 FAB 回到可见态', (await fabHiddenState()) === false)

// 回到顶部：分隔线淡出
await scrollMain(0)
await new Promise((r) => setTimeout(r, 250))
ok('390 · 回到顶部后分隔线淡出', await page.evaluate(() => {
  const h = document.querySelector('header')
  return h ? getComputedStyle(h).borderBottomColor === 'rgba(0, 0, 0, 0)' : false
}))
await page.screenshot({ path: resolve(OUT, '390-home-top.png') })

// FAB 交互：弹出 → 新建笔记 → 关闭
await clickDom('[data-testid="app-fab"] button')
await new Promise((r) => setTimeout(r, 200))
const fabMenu = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-create-menu] [role="menu"]')).map((m) => m.textContent.replace(/\s+/g, ' ').trim()))
ok('390 · FAB 弹出含三项动作', fabMenu.length >= 1 && /新建笔记/.test(fabMenu.join()) && /新建文件夹/.test(fabMenu.join()) && /导入笔记/.test(fabMenu.join()), fabMenu.join(' | '))
await page.screenshot({ path: resolve(OUT, '390-fab-menu.png') })
await clickByText('[data-create-menu] [role="menu"] button', '新建笔记')
await new Promise((r) => setTimeout(r, 300))
ok('390 · FAB → 新建笔记对话框打开', await page.evaluate(() => !!document.querySelector('[role="dialog"]')))
await page.keyboard.press('Escape')
await new Promise((r) => setTimeout(r, 300))
ok('390 · ESC 关闭对话框', await page.evaluate(() => !document.querySelector('[role="dialog"]')))

// TabBar 导航
await clickByText('[data-testid="bottom-tabbar"] a', '笔记')
await page.waitForFunction(() => location.pathname.startsWith('/notes'), { timeout: 20000 })
ok('390 · TabBar 导航到 /notes', true, await page.evaluate(() => location.pathname))
await page.screenshot({ path: resolve(OUT, '390-notes.png') })

// 抽屉宽度公式：390 → 320
await clickDom('header button[title="打开侧栏"]')
await new Promise((r) => setTimeout(r, 450))
const drawer = await box('[data-scroll-root]')
const dWrap = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('div')).filter((d) => d.style && d.style.width.endsWith('px') && d.className.includes('absolute'))
  const el = els[0]
  return el ? el.getBoundingClientRect().width : null
})
ok('390 · 抽屉宽度 = 320（公式 min(320, max(300, 390×0.82))）', dWrap !== null && Math.abs(dWrap - 320) < 1.5, `w=${dWrap}`)
await page.screenshot({ path: resolve(OUT, '390-drawer.png') })
await page.keyboard.press('Escape')
await new Promise((r) => setTimeout(r, 300))
void drawer

// 详情页 + 编辑态让位
const detailPath = await page.evaluate(async () => {
  const r = await fetch('/api/notes?pageSize=1')
  const j = await r.json()
  const slug = j?.notes?.[0]?.slug
  return slug ? '/notes/' + slug.split('/').map(encodeURIComponent).join('/') : '/notes'
})
await page.goto(BASE + detailPath, { waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-testid="bottom-tabbar"]'), { timeout: 30000 })
ok('390 · 详情页仍有底部 TabBar', await vis('[data-testid="bottom-tabbar"]'))
const editBtnFound = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === '编辑')
  if (!btn) return false
  btn.click()
  return true
})
if (editBtnFound) {
  await new Promise((r) => setTimeout(r, 400))
  ok('390 · 编辑态隐藏底部 TabBar', !(await vis('[data-testid="bottom-tabbar"]')))
  await page.screenshot({ path: resolve(OUT, '390-editing.png') })
  await clickByText('button', '取消')
  await new Promise((r) => setTimeout(r, 400))
  ok('390 · 退出编辑态恢复 TabBar', await vis('[data-testid="bottom-tabbar"]'))
} else {
  ok('390 · 编辑按钮存在（管理员）', false, '未找到「编辑」按钮')
}

// ================= B. 平板 768 & 小屏 360 =================
await page.setViewport({ width: 768, height: 1024 })
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 400))
ok('768 · 底部 TabBar 隐藏', !(await vis('[data-testid="bottom-tabbar"]')))
ok('768 · FAB 隐藏', !(await vis('[data-testid="app-fab"]')))
ok('768 · 汉堡可见', await vis('header button[title="打开侧栏"]'))
ok('768 · 图标栏隐藏', !(await vis('nav[aria-label="主导航"]')))
ok('768 · 无横向滚动', await noHScroll())
await clickDom('header button[title="打开侧栏"]')
await new Promise((r) => setTimeout(r, 450))
// 768 属 <1024 抽屉模式。宽度公式是**双向夹紧**而非线性：
// min(320, max(300, 768×0.82 = 629.8)) = 320 —— 上限 320 生效。
// 此处的真回归点是「抽屉在 768–1023 能打开」：E4 曾因 md(768)/lg(1024) 混用，
// 图标栏已隐藏而汉堡也被 md:hidden 藏掉，抽屉根本打不开。
ok('768 · 抽屉可打开且宽度 = 320（上限夹紧）', await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('div'))
    .find((d) => d.style && d.style.width === '320px' && d.className.includes('absolute'))
  return !!el
}))
await page.screenshot({ path: resolve(OUT, '768-drawer.png') })
await page.keyboard.press('Escape')
await new Promise((r) => setTimeout(r, 300))

await page.setViewport({ width: 360, height: 780 })
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 400))
ok('360 · 无横向滚动', await noHScroll())
await clickDom('header button[title="打开侧栏"]')
await new Promise((r) => setTimeout(r, 450))
ok('360 · 抽屉宽度 = 300（公式下限夹紧）', await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('div')).find((d) => d.style && d.style.width === '300px')
  return !!el
}), '360×0.82=295.2→夹紧 300')
await page.keyboard.press('Escape')
await new Promise((r) => setTimeout(r, 300))
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 400))
ok('360 · TabBar 仍可见且无溢出', await vis('[data-testid="bottom-tabbar"]'))
await page.screenshot({ path: resolve(OUT, '360-home.png') })

// ================= C. 桌面 1440 =================
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 400))
ok('1440 · 图标栏可见', await vis('nav[aria-label="主导航"]'))
ok('1440 · 底部 TabBar 隐藏', !(await vis('[data-testid="bottom-tabbar"]')))
ok('1440 · FAB 隐藏', !(await vis('[data-testid="app-fab"]')))
ok('1440 · 汉堡隐藏', !(await vis('header button[title="打开侧栏"]')))
// 注意：品牌入口也是 <a>，必须按导航文案过滤，否则会数成 5 项
const NAV_LABELS = ['首页', '笔记', '知识图谱', '管理后台', '我的密钥']
const railItems = await page.evaluate((labels) =>
  Array.from(document.querySelectorAll('nav[aria-label="主导航"] a'))
    .map((a) => a.getAttribute('title'))
    .filter((t) => labels.includes(t)), NAV_LABELS)
ok('1440 · 图标栏 4 项含「管理后台」', railItems.length === 4 && railItems.includes('管理后台'), railItems.join(' / '))
ok('1440 · 无横向滚动', await noHScroll())
// 截图必须留在 1440 段内 —— 边界检查会改视口，跨段截图会拍到错误的宽度
await page.screenshot({ path: resolve(OUT, '1440-home.png') })

// ================= D. 640 精确边界（CSS `sm:hidden`）=================
// 必须放在 1440 段**之后**：此处会切换视口，否则会把 1440 的断言与截图跑在 641 宽度下。
await page.setViewport({ width: 639, height: 900 })
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 350))
ok('639 · TabBar 可见（<640）', await vis('[data-testid="bottom-tabbar"]'))
ok('639 · FAB 可见（<640）', await vis('[data-testid="app-fab"]'))
ok('639 · 无横向滚动', await noHScroll())
await page.setViewport({ width: 641, height: 900 })
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise((r) => setTimeout(r, 350))
ok('641 · TabBar 隐藏（≥640 交回图标栏 / 抽屉）', !(await vis('[data-testid="bottom-tabbar"]')))
ok('641 · FAB 隐藏（≥640）', !(await vis('[data-testid="app-fab"]')))
ok('641 · 无横向滚动', await noHScroll())

// ---- 控制台问题 ----
const hydration = consoleIssues.filter((s) => /hydrat|mismatch/i.test(s))
ok('无 hydration mismatch', hydration.length === 0, hydration.slice(0, 3).join(' || ') || 'none')
const vueErrs = consoleIssues.filter((s) => /\[error\]|\[pageerror\]/.test(s))
ok('无控制台 error', vueErrs.length === 0, vueErrs.slice(0, 3).join(' || ') || 'none')

await fs.writeFile(resolve(OUT, '_report.json'), JSON.stringify({ results, consoleIssues }, null, 2))
const pass = results.filter((r) => r.pass).length
console.log(`\n==== ${pass}/${results.length} PASS ====`)
if (consoleIssues.length) {
  console.log('\n控制台输出（前 20 条）：')
  consoleIssues.slice(0, 20).forEach((s) => console.log('  ' + s.slice(0, 220)))
}
await browser.close()
process.exit(pass === results.length ? 0 : 1)
