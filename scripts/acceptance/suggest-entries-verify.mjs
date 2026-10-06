// 标签 · 领域自动分配 —— 入口与设置的 UI 验收
//
// 覆盖四件事（都是用户实际反馈过的问题，各对应一条断言）：
//   A. **AI 增强开关点击即保存**：早前开关只改本地表单、必须再点「保存」才落库，
//      用户翻开关后一刷新就回到原值（表现为「显示已开启但未生效，刷新后自动关闭」）。
//      A2 就是这条的回归：点完开关**不点保存**直接刷新，状态必须保持。
//   B. **多选器确认后立即关闭**：判定可能要几十秒（大选择量还会分片），若把关闭写在成功分支
//      之后，一旦某片失败或被反代超时（生产 Nginx 默认 60s 读超时）弹窗就卡住不关、
//      并挡住随后要打开的审核面板。B1 断言「确认后 3 秒内即关闭」，B3 断言面板收敛到本次篇数。
//   C/D. **三处入口都要有「标签 · 领域自动分配」**：结构树右键（目录与文件各一条）、
//      笔记详情页「更多操作」。少一处用户就会说「这里没有」。
//
// ⚠️ 本脚本会真实写库（生成待审建议、切换 AI 开关后还原）。**不要对生产跑**；
//    生产上线后用 `acceptance:prod`（只读）。
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { BASE, ROOT_KEY, CHROME, PROJECT_ROOT, loadPuppeteer } from './_env.mjs'

const OUT = resolve(PROJECT_ROOT, '.workbuddy/backups/suggest-entries')
mkdirSync(OUT, { recursive: true })

const results = []
const log = (id, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} | ${id}${extra ? ' | ' + extra : ''}`)
  console.log(results.at(-1))
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const vr = await fetch(BASE + '/api/auth/verify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: ROOT_KEY })
})
const token = /garden_token=([^;]+)/.exec(vr.headers.get('set-cookie') || '')?.[1]
if (!token) { console.error('缺少 GARDEN_ROOT_KEY 或登录失败'); process.exit(2) }

const puppeteer = await loadPuppeteer()
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 950 })
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 180)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 180)) })
await browser.setCookie({ name: 'garden_token', value: token, domain: new URL(BASE).hostname, path: '/' })

const clickText = (t) => page.evaluate((x) => {
  const b = [...document.querySelectorAll('button')].find(el => (el.textContent || '').includes(x))
  if (!b) return false
  b.click(); return true
}, t)

// ── 页面可编译（Vue 模板编译错误会让整页 500，而 typecheck 查不出） ──
await page.goto(BASE + '/admin', { waitUntil: 'networkidle2', timeout: 90_000 })
await page.waitForSelector('h1', { timeout: 40_000 })
await sleep(2500)
const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || '')
log('E1 /admin 正常渲染（无模板编译错误）', h1.includes('管理后台'), `h1=${h1}`)

const swState = () => page.evaluate(() => ({
  checked: document.querySelector('[role="switch"][aria-label="启用 AI 增强"]')?.getAttribute('aria-checked'),
  status: (() => {
    const sec = [...document.querySelectorAll('section')].find(s => s.textContent?.includes('AI 增强设置'))
    const m = /当前状态\s*(.+?)\s*(配置来源|已存密钥|启用 AI 增强)/.exec((sec?.innerText || '').replace(/\n/g, ' '))
    return m ? m[1].trim() : '(未解析)'
  })()
}))

// ── A：AI 开关点击即保存 ──
console.log('\n--- A AI 增强开关 ---')
const before = await swState()
await page.evaluate(() => document.querySelector('[role="switch"][aria-label="启用 AI 增强"]')?.click())
await sleep(2500)
const afterClick = await swState()
log('A1 点开关后状态翻转', afterClick.checked !== before.checked, `${before.checked} → ${afterClick.checked}`)

// 关键：**不点保存**直接刷新 —— 若开关不即时落库，这里会回到原值
await page.reload({ waitUntil: 'networkidle2' })
await sleep(2500)
const afterReload = await swState()
log('A2 刷新后仍保持（点击即已落库，无需再点保存）', afterReload.checked === afterClick.checked,
  `刷新后=${afterReload.checked}（期望 ${afterClick.checked}）`)
log('A3 状态文案不再误报「缺密钥或模型名」', !afterReload.status.includes('缺密钥或模型名'), afterReload.status)

// 还原开关（本脚本自清理，避免改变环境状态）
if (afterReload.checked !== before.checked) {
  await page.evaluate(() => document.querySelector('[role="switch"][aria-label="启用 AI 增强"]')?.click())
  await sleep(2500)
  const restored = await swState()
  log('A4 已还原开关到初始状态', restored.checked === before.checked, `还原后=${restored.checked}`)
} else {
  log('A4 已还原开关到初始状态', true, '本就与初始一致')
}

// ── B：多选器确认后立即关闭，且审核面板收敛到本次篇数 ──
console.log('\n--- B 多选器关闭时机 ---')
await clickText('选择笔记生成')
await page.waitForSelector('[data-testid="app-dialog"]', { timeout: 20_000 })
await sleep(1800)
await page.evaluate(() => document.querySelector('[data-testid="app-dialog"] ul.divide-y > li button')?.click())
await sleep(400)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-testid="app-dialog"] footer button')].find(x => (x.textContent || '').includes('生成建议'))
  b?.click()
})
await sleep(1000)
await clickText('开始生成')

let closedAt = -1
for (let i = 0; i < 20; i++) {
  await sleep(300)
  const pickerOpen = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="app-dialog"]')].some(d => (d.innerText || '').includes('挑出要重新判定的笔记'))
  )
  if (!pickerOpen) { closedAt = i * 300; break }
}
log('B1 确认后多选器立即关闭（未等判定结束）', closedAt >= 0 && closedAt < 3000, `关闭于 ≈${closedAt}ms`)

// ⚠️ 轮询到**表头出现**才算就绪：面板内部的待审列表是异步拉的，
// 元素刚挂载时 focused 还是空的，会渲染成「没有待审建议」空态（曾因此误报条目数 -1）。
let review = null
for (let i = 0; i < 40; i++) {
  await sleep(500)
  const r = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[data-testid="app-dialog"]')].find(x => (x.innerText || '').includes('标签 · 领域审核'))
    if (!d) return null
    const m = /全选（(\d+) 条/.exec(d.innerText || '')
    return m ? { count: Number(m[1]) } : null
  })
  if (r) { review = r; break }
}
log('B2 审核面板已打开', !!review, JSON.stringify(review))
log('B3 面板收敛到刚判定的 1 篇（而非全库待审）', review?.count === 1, `条目数=${review?.count}`)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-testid="app-dialog"] footer button')].find(x => (x.textContent || '').trim() === '关闭')
  b?.click()
})
await sleep(600)

// ── C：结构树右键（目录 + 文件） ──
console.log('\n--- C 结构树右键入口 ---')
await page.goto(BASE + '/notes', { waitUntil: 'networkidle2', timeout: 90_000 })
await page.waitForSelector('[data-tree-path]', { timeout: 40_000 })
await sleep(1500)

const ctxOn = async (path) => {
  await page.evaluate((p) => {
    const el = document.querySelector(`[data-tree-path="${CSS.escape(p)}"]`)
    el?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 320, clientY: 300 }))
  }, path)
  await sleep(700)
  return page.evaluate(() => {
    const m = document.querySelector('[role="menu"]')
    return m ? (m.innerText || '').replace(/\s+/g, ' ').trim() : ''
  })
}

const dirPath = await page.evaluate(() =>
  [...document.querySelectorAll('[data-tree-path]')].find(e => e.hasAttribute('aria-expanded'))?.getAttribute('data-tree-path') || '')
const dirMenu = dirPath ? await ctxOn(dirPath) : ''
log('C1 目录右键含「标签 · 领域自动分配」', dirMenu.includes('标签 · 领域自动分配'), `目录=${dirPath}`)
await page.keyboard.press('Escape')
await sleep(400)

// ⚠️ 不能用 `.endsWith('.md')` 判别文件节点：`pathOf(node)` 用的是 node.name，而文件节点的
// name 已被去掉 .md。可靠判据：目录行有 `aria-expanded`，文件行没有。
const findFile = () => page.evaluate(() => {
  const f = [...document.querySelectorAll('[data-tree-path]')].find(e => !e.hasAttribute('aria-expanded'))
  return f ? f.getAttribute('data-tree-path') : ''
})
const expandPath = async (p) => {
  await page.evaluate((path) => {
    const el = document.querySelector(`[data-tree-path="${CSS.escape(path)}"]`)
    if (el && el.getAttribute('aria-expanded') === 'false') el.click()
  }, p)
  await sleep(900)
}
let filePath = ''
for (const top of ['zrw', 'ltl', 'lyf', 'KnowledgeBase']) {
  await expandPath(top)
  filePath = await findFile()
  if (filePath) break
  const sub = await page.evaluate((t) => {
    const d = [...document.querySelectorAll('[data-tree-path]')].find(e => {
      const p = e.getAttribute('data-tree-path') || ''
      return p.startsWith(t + '/') && e.hasAttribute('aria-expanded') && p.split('/').length === 2
    })
    return d ? d.getAttribute('data-tree-path') : ''
  }, top)
  if (sub) {
    await expandPath(sub)
    filePath = await findFile()
    if (filePath) break
  }
}
const fileMenu = filePath ? await ctxOn(filePath) : ''
log('C2 文件右键含「标签 · 领域自动分配」', !!filePath && fileMenu.includes('标签 · 领域自动分配'),
  `文件=${filePath || '(未找到)'}`)
await page.keyboard.press('Escape')
await sleep(400)

// ── D：笔记详情页「更多操作」 ──
console.log('\n--- D 详情页更多操作入口 ---')
await page.goto(BASE + '/notes/KnowledgeBase/03_Knowledge/前端/TypeScript/泛型', { waitUntil: 'networkidle2', timeout: 90_000 })
await sleep(2500)
const dh1 = await page.evaluate(() => document.body.innerText.slice(0, 60).replace(/\s+/g, ' '))
log('D1 详情页正常渲染', !dh1.includes('Vite Error') && !dh1.includes('500'), dh1)

const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('title') === '更多操作') || (x.getAttribute('aria-label') === '更多操作'))
  if (!b) return false
  b.click(); return true
})
await sleep(900)
// 注意：本项目的 Menu 组件是自定义浮层、**不用 role="menu"**，所以按内容定位而不是按 ARIA 角色
const menu = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => {
    const t = d.innerText || ''
    return t.includes('复制笔记链接') && t.includes('标签与成熟度')
  })
  return el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : ''
})
log('D2 详情页更多操作含「标签 · 领域自动分配」', opened && menu.includes('标签 · 领域自动分配'),
  `菜单=${menu.slice(0, 120)}`)

await page.screenshot({ path: resolve(OUT, 'entries.png') })
log('E2 运行期无 JS 错误', errors.length === 0, errors.join(' / ') || '(无)')

console.log(`\n总计 ${results.length} 项，失败 ${results.filter(r => r.startsWith('FAIL')).length} 项`)
console.log('截图:', OUT)
await browser.close()
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
