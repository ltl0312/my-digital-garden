// 阶段 E4 验证：断点规则（≥1280 / 1024–1279 / 768–1023 / <768）+ 移动端细节 + 四档视口无横向滚动
import { resolve } from 'node:path'
// 共享配置：目标地址 / 登录凭据 / 浏览器与 puppeteer-core 位置（见 ./_env.mjs 与 README.md）
import { BASE, ROOT_KEY, CHROME, PROJECT_ROOT, loadPuppeteer } from './_env.mjs'

const puppeteer = await loadPuppeteer()

if (!ROOT_KEY) {
  console.error('[acceptance] 缺少登录密钥：请在仓库根目录创建 .env.acceptance（模板见 scripts/acceptance/.env.acceptance.example），或设置环境变量 GARDEN_ROOT_KEY。')
  process.exit(1)
}

const OUT = resolve(PROJECT_ROOT, '.workbuddy/backups/e-shots/after-e4')
const results = []
const pageErrors = []
const log = (id, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} | ${id}${extra ? ' | ' + extra : ''}`); console.log(results.at(-1)) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const page = await browser.newPage()
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)))
await page.setViewport({ width: 1440, height: 900 })

await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 90000 })
await page.type('input[type="password"]', ROOT_KEY)
await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('进入花园'))?.click())
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 60000 })
await page.waitForFunction(() => !!document.querySelector('[data-create-menu]'), { timeout: 60000 })
await sleep(800)

const goto = async (path) => {
  await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 90000 })
  await sleep(900)
}
const setVp = async (w, h) => { await page.setViewport({ width: w, height: h }); await sleep(700) }

const chrome = () => page.evaluate(() => {
  const rail = document.querySelector('nav[aria-label="主导航"]')
  const ham = document.querySelector('button[aria-label="打开侧栏"]')
  const searchBtn = document.querySelector('button[aria-label="搜索"]')
  const searchBox = document.querySelector('button[aria-label="搜索"]') ? null : document.querySelector('header button[title="打开侧栏"]')
  const user = document.querySelector('button[aria-label="账户菜单"]')
  const crumbs = Array.from(document.querySelectorAll('nav[aria-label="面包屑"] span'))
  const visibleCrumbs = crumbs.filter(s => getComputedStyle(s).display !== 'none' && s.textContent.trim())
  const icons = Array.from(document.querySelectorAll('header button')).filter(b => /打开侧栏|搜索|账户菜单|新建/.test((b.getAttribute('aria-label') || '') + (b.getAttribute('title') || '')))
    .map(b => { const r = b.getBoundingClientRect(); return `${(b.getAttribute('aria-label') || b.getAttribute('title') || '').slice(0, 6)}:${Math.round(r.width)}x${Math.round(r.height)}` })
  return {
    rail: !!rail && rail.getBoundingClientRect().width > 0,
    ham: !!ham && getComputedStyle(ham).display !== 'none',
    searchBtn: !!searchBtn && getComputedStyle(searchBtn).display !== 'none',
    user: !!user && getComputedStyle(user).display !== 'none',
    crumbText: visibleCrumbs.map(s => s.textContent.trim()).join('/'),
    icons,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth
  }
})

// ============ 1. 断点规则：图标栏 / 汉堡 显隐 ============
await goto('/notes')
for (const [w, h, expectRail, expectHam] of [[1440, 900, true, false], [1280, 900, true, false], [1024, 900, true, false], [1023, 900, false, true], [768, 900, false, true], [390, 844, false, true]]) {
  await setVp(w, h)
  const c = await chrome()
  log(`① ${w}px：图标栏${expectRail ? '显示' : '隐藏'} / 汉堡${expectHam ? '显示' : '隐藏'}`,
    c.rail === expectRail && c.ham === expectHam, `rail=${c.rail} ham=${c.ham}`)
}

// ============ 2. 768–1023 抽屉（汉堡可开 + 遮罩可关） ============
await setVp(900, 900)
{
  const before = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    return { w: aside ? Math.round(aside.getBoundingClientRect().width) : 0 }
  })
  await page.evaluate(() => document.querySelector('button[aria-label="打开侧栏"]')?.click())
  await sleep(800)
  const opened = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    const r = aside?.getBoundingClientRect()
    const overlay = Array.from(document.querySelectorAll('div')).find(d => {
      const cs = getComputedStyle(d)
      return cs.position === 'absolute' && cs.inset === '0px' && /rgba?\(/.test(cs.backgroundColor) && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
    })
    return { w: r ? Math.round(r.width) : 0, left: r ? Math.round(r.left) : -1, overlay: !!overlay }
  })
  // M1 起抽屉宽度由公式决定（交付物 §5 ④）：min(320, max(300, 视口宽 × 0.82))
  // 900px → min(320, max(300, 738)) = 320。原写死 286px 的断言属有意变更，非回归。
  log('② 900px：抽屉可打开且贴左（宽 320 = 公式值）', before.w === 0 && opened.w === 320 && opened.left === 0, `before=${before.w} after=${opened.w} left=${opened.left}`)
  log('② 900px：抽屉带遮罩', opened.overlay)
  // 点遮罩关闭
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div')).filter(d => {
      const cs = getComputedStyle(d)
      return cs.position === 'absolute' && cs.inset === '0px' && cs.zIndex === '30'
    })
    els[0]?.click()
  })
  await sleep(700)
  log('② 900px：点遮罩可关闭抽屉', await page.evaluate(() => { const a = document.querySelector('aside'); return !a || a.getBoundingClientRect().width === 0 }))
}

// ============ 3. 顶栏动作收敛 + 用户菜单（<1024） ============
await setVp(390, 844)
await goto('/')
{
  const c = await chrome()
  log('③ 390px：顶栏收敛为 汉堡/搜索/新建/用户', c.ham && c.searchBtn && c.user, c.icons.join(' '))
  log('③ 390px：面包屑收敛为末段标题', !c.crumbText.includes('/'), c.crumbText || '(空)')
  const sizes = c.icons.map(i => Number(i.split(':')[1].split('x')[0]))
  log('③ 390px：顶栏图标按钮触控目标 ≥38px', sizes.length >= 3 && sizes.every(s => s >= 38), c.icons.join(' '))

  // 搜索图标 → 命令面板
  await page.evaluate(() => document.querySelector('button[aria-label="搜索"]')?.click())
  await sleep(700)
  const cmd = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"], [role="listbox"], input[placeholder*="搜索"]')
    return { open: !!d, hasKbd: !!document.querySelector('kbd') }
  })
  log('③ 390px：搜索图标可打开命令面板', cmd.open)
  await page.keyboard.press('Escape')
  await sleep(400)

  // 用户菜单
  await page.evaluate(() => document.querySelector('button[aria-label="账户菜单"]')?.click())
  await sleep(600)
  const um = await page.evaluate(() => Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]')).map(b => b.innerText.trim()))
  log('③ 390px：用户菜单含管理后台 / 主题 / 退出登录',
    um.some(x => x.includes('管理后台') || x.includes('我的密钥')) && um.some(x => x.includes('切换到')) && um.some(x => x.includes('退出登录')), um.join(' | '))
  await page.keyboard.press('Escape')
  await sleep(300)
}

// ============ 4. 四档视口 × 五页：无横向滚动 ============
const slug = await page.evaluate(async () => (await (await fetch('/api/notes?pageSize=1')).json()).notes[0].slug)
const enc = slug.split('/').map(encodeURIComponent).join('/')
const PAGES = ['/', '/notes', `/notes/${enc}`, '/graph', '/admin']
for (const w of [1440, 1280, 1024, 768, 390]) {
  await page.setViewport({ width: w, height: 900 })
  for (const p of PAGES) {
    await goto(p)
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    log(`④ ${w}px ${p} 无横向滚动`, o.sw <= o.cw + 1, `scrollWidth=${o.sw} client=${o.cw}`)
  }
}

// ============ 5. 详情页 @390 正文宽度 ≥ 350 ============
await setVp(390, 844)
await goto(`/notes/${enc}`)
{
  const m = await page.evaluate(() => {
    const a = document.querySelector('[data-article-body]')
    const h1 = document.querySelector('h1')
    return { body: a ? Math.round(a.getBoundingClientRect().width) : 0, title: h1 ? Math.round(h1.getBoundingClientRect().width) : 0 }
  })
  log('⑤ 390px 详情页正文宽度 ≥ 350px', m.body >= 350, `正文=${m.body} 标题=${m.title}`)
  // 目录栏在 <1280 隐藏
  const tocHidden = await page.evaluate(() => {
    const rail = document.querySelector('[data-toc-rail]')
    return !rail || !rail.offsetParent || rail.getBoundingClientRect().width === 0
  })
  log('⑤ 390px 详情页隐藏右侧目录栏', tocHidden)
  // 深路径下（11 段）面包屑应只留末段
  const bc = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('nav[aria-label="面包屑"] span'))
    return spans.filter(s => getComputedStyle(s).display !== 'none' && s.textContent.trim()).map(s => s.textContent.trim())
  })
  log('⑤ 390px 深路径面包屑收敛为末段', bc.length === 1, JSON.stringify(bc))
}
await setVp(1279, 900)
await goto(`/notes/${enc}`)
log('⑤ 1279px 详情页隐藏目录栏（并入正文顶部）', await page.evaluate(() => {
  const rail = document.querySelector('[data-toc-rail]')
  return !rail || !rail.offsetParent || rail.getBoundingClientRect().width === 0
}))
await setVp(1280, 900)
await goto(`/notes/${enc}`)
log('⑤ 1280px 详情页显示常驻目录栏（sticky + 236px）', await page.evaluate(() => {
  const rail = document.querySelector('[data-toc-rail]')
  const r = rail?.getBoundingClientRect()
  return !!r && r.width >= 200 && getComputedStyle(rail).position === 'sticky'
}))

// ============ 6. 图谱：窄屏最小可读缩放 0.34 ============
await setVp(390, 844)
await goto('/graph')
{
  await page.waitForFunction(() => document.querySelectorAll('svg g g').length > 50, { timeout: 60000 }).catch(() => {})
  await sleep(1200)
  // 连续缩小，读实际 scale
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => document.querySelector('button[aria-label="缩小"]')?.click())
    await sleep(280)
  }
  const view = await page.evaluate(() => {
    const g = document.querySelector('svg > g')
    const t = g?.getAttribute('transform') || ''
    const m = t.match(/scale\(([\d.]+)\)/)
    const visEl = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0
    }
    // M4 起 <640 的图例与统计收进底部折叠面板（原两个常驻浮层改由 ≥640 承担）。
    // 这里改用 data-testid 判「可见性」，不再用「文本 + class 含 absolute」——
    // 后者会匹配到新的底部面板容器，属于假通过。
    const overlays = {
      locate: !!document.querySelector('input[placeholder="定位笔记…"]'),
      legendRail: visEl('[data-testid="graph-legend"]'),
      statsRail: visEl('[data-testid="graph-stats"]'),
      bottomPanel: visEl('[data-testid="graph-panel-toggle"]')
    }
    return { transform: t, k: m ? Number(m[1]) : null, overlays }
  })
  log('⑥ 390px 图谱最小缩放被限制在 0.34', view.k !== null && view.k >= 0.335 && view.k <= 0.40, `k=${view.k}`)
  log('⑥ 390px 左上「定位笔记」入口可用', view.overlays.locate)
  log('⑥ 390px 图例与统计改由底部折叠面板承载（原浮层隐藏）',
    view.overlays.bottomPanel && !view.overlays.legendRail && !view.overlays.statsRail,
    JSON.stringify(view.overlays))

  // 原「图例与统计不重叠」在 <640 已无对照对象（两者合并进同一个面板）；
  // 改为断言新载体展开后自身不横向溢出，保持「浮层不越界」这一原始意图。
  await page.evaluate(() => document.querySelector('[data-testid="graph-panel-toggle"]')?.click())
  await sleep(450)
  const panel = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="graph-panel-toggle"]')?.parentElement
    const r = host?.getBoundingClientRect()
    return r ? { w: Math.round(r.width), right: Math.round(r.right), vw: window.innerWidth } : null
  })
  log('⑥ 390px 底部面板展开后不横向溢出',
    !!panel && panel.w <= panel.vw && panel.right <= panel.vw, JSON.stringify(panel))
  await page.screenshot({ path: `${OUT}/graph-390x844.png` }).catch(() => {})
}

// ============ 7. 导入对话框 @390：单列 + 动作按钮拉通 ============
await setVp(390, 844)
await goto('/')
{
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('新建'))?.click())
  await sleep(400)
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('导入笔记'))?.click())
  await sleep(1200)
  const imp = await page.evaluate(() => {
    // M4 起对话框卡片不再带 `rounded-overlay`（改成按形态分写的长写圆角），
    // 改用稳定语义钩子 `[data-dialog-card]` —— 自动化不应依赖视觉类名。
    const card = document.querySelector('[data-dialog-card]')
    const cr = card?.getBoundingClientRect()
    const btns = Array.from(card?.querySelectorAll('button') || [])
    const footer = Array.from(card?.querySelectorAll('div') || []).find(d => /导入只在通过校验|存在阻止项/.test(d.textContent) && d.className.includes('flex-col-reverse'))
    const footerBtns = Array.from(footer?.querySelectorAll('button') || []).map(b => Math.round(b.getBoundingClientRect().width))
    const sizeColHidden = Array.from(card?.querySelectorAll('span') || []).filter(s => /^\d+(\.\d+)?\s?[KM]?B$/.test(s.textContent.trim())).every(s => getComputedStyle(s).display === 'none')
    return {
      cardW: cr ? Math.round(cr.width) : 0,
      footerCol: !!footer,
      footerBtns,
      footerRowW: footer ? Math.round((footer.querySelector('.flex') || footer).getBoundingClientRect().width) : 0
    }
  })
  // 原基线「≤358」来自当时卡片四周各留 16px；M4 起 <640 改为全屏弹层（交付物第 13 屏），
  // 卡片宽度即视口宽。验收本意是「不横向溢出」，故改为 ≤ 视口宽。
  log('⑦ 390px 导入对话框不溢出视口', imp.cardW > 0 && imp.cardW <= 390, `card=${imp.cardW}`)
  log('⑦ 390px 底部动作改为单列（flex-col-reverse）', imp.footerCol)
  log('⑦ 390px 底部按钮拉通（覆盖整行 ≥ 85%）',
    imp.footerBtns.length >= 2
    && imp.footerBtns.every(b => b >= 90)
    && imp.footerBtns.reduce((a, b) => a + b, 0) >= imp.footerRowW * 0.85,
    `btns=${JSON.stringify(imp.footerBtns)} row=${imp.footerRowW}`)
  await page.screenshot({ path: `${OUT}/import-390x844.png` }).catch(() => {})
  await page.evaluate(() => document.querySelector('.modal-x')?.click())
  await sleep(400)
}

// ============ 8. 截图：四档视口 ============
for (const [w, h] of [[1280, 900], [1024, 900], [768, 900], [390, 844]]) {
  await page.setViewport({ width: w, height: h })
  await goto('/notes')
  await page.screenshot({ path: `${OUT}/notes-${w}x${h}.png` }).catch(() => {})
}

console.log('\n---- 汇总 ----')
console.log(results.join('\n'))
console.log(`总计 ${results.length} 项，失败 ${results.filter(r => r.startsWith('FAIL')).length} 项`)
if (pageErrors.length) console.log('\n---- 运行时异常 ----\n' + [...new Set(pageErrors)].slice(0, 6).join('\n'))
await browser.close()
