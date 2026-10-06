// 笔记多选器（「指定哪些笔记做自动化判定」）的 UI 验收
//
// 为什么要单独一套 UI 断言：**`nuxt typecheck` 查不出 Vue 模板编译错误**。
// 实测两次真事故都只有真正加载页面才会暴露：
//   ① 把组件插进 `v-if` 的 </template> 与 `v-else` 之间 → Vue 报
//      「v-else/v-else-if has no adjacent v-if or v-else-if」→ /admin 整页 500；
//   ② `onlyIds` 忘了从布局传进面板 → 点「重新判定」后面板展示全库待审（56 条而非 1 条），
//      而当时的断言只检查「标题出现在面板里」，56 条里当然包含它 → **假通过**。
// 所以这里的关键断言是**面板条目数必须等于本次生成的篇数**，而不是「文本包含标题」。
//
// ⚠️ 本脚本会真实写入：会生成待审建议（`Suggestion` 表），并触发一次真实判定。
//    **不要对生产跑**（生产用 acceptance:prod，只读）。跑完请自行在审核面板驳回/清理。
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { BASE, ROOT_KEY, CHROME, PROJECT_ROOT, loadPuppeteer } from './_env.mjs'

const OUT = resolve(PROJECT_ROOT, '.workbuddy/backups/picker-ui')
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
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })

await browser.setCookie({ name: 'garden_token', value: token, domain: new URL(BASE).hostname, path: '/' })

const clickByText = async (text, tag = 'button') => page.evaluate((t, g) => {
  const el = [...document.querySelectorAll(g)].find(x => (x.textContent || '').includes(t))
  if (!el) return false
  el.click()
  return true
}, text, tag)

const dlgText = async () => page.evaluate(() => document.querySelector('[data-testid="app-dialog"]')?.innerText || '')
const rowCount = async () => page.evaluate(() => document.querySelectorAll('[data-testid="app-dialog"] ul.divide-y > li').length)
const selectedText = async () => page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-testid="app-dialog"] footer *')].find(x => (x.textContent || '').includes('已选'))
  return el?.textContent?.replace(/\s+/g, ' ').trim() || ''
})
const genDisabled = async () => page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-testid="app-dialog"] footer button')].find(x => (x.textContent || '').includes('生成建议'))
  return b ? b.disabled : null
})

// ── 加载管理后台（这一步就能抓到模板编译错误） ──────────────────────────────
await page.goto(BASE + '/admin', { waitUntil: 'networkidle2', timeout: 90_000 })
await page.waitForSelector('h1', { timeout: 40_000 })
await sleep(2500)

const heading = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() || '')
log('U0 /admin 正常渲染（无模板编译错误导致的 500）', heading.includes('管理后台'), `h1=${heading}`)

log('U1 管理后台有「选择笔记生成…」按钮', await clickByText('选择笔记生成'))
await page.waitForSelector('[data-testid="app-dialog"]', { timeout: 20_000 })
await sleep(1800)

let t = await dlgText()
log('U2 多选器打开且含说明与筛选',
  t.includes('挑出要重新判定的笔记') && t.includes('还没有待审') && t.includes('全部领域'),
  t.replace(/\s+/g, ' ').slice(0, 110))

const n = await rowCount()
log('U3 默认筛「还没有待审」并列出笔记', n > 0, `rows=${n}`)
log('U4 初始「已选 0 篇」', (await selectedText()).includes('0'), await selectedText())
log('U5 未选择时「生成建议」禁用', (await genDisabled()) === true)

await page.evaluate(() => document.querySelector('[data-testid="app-dialog"] ul.divide-y > li button')?.click())
await sleep(400)
log('U6 点一行后「已选 1 篇」且按钮可用',
  (await selectedText()).includes('1') && (await genDisabled()) === false, await selectedText())

await clickByText('全选本页')
await sleep(500)
log('U7 「全选本页」选上本页 20 篇', (await selectedText()).includes('20'), await selectedText())
await clickByText('清空选择')
await sleep(400)
log('U8 「清空选择」归零', (await selectedText()).includes('0'), await selectedText())

await clickByText('已有待审')
await sleep(1800)
log('U9 切到「已有待审」后列表出现待审徽标', (await dlgText()).includes('已有待审'), `rows=${await rowCount()}`)
await page.screenshot({ path: resolve(OUT, 'picker-has-pending.png') })

await clickByText('还没有待审')
await sleep(1500)
await page.type('[data-testid="app-dialog"] input[placeholder="搜索标题或正文…"]', '泛型')
await sleep(2000)
const searched = await dlgText()
log('U10 搜索生效（计数收敛）', /共 \d+ 篇/.test(searched), (searched.match(/共 \d+ 篇/) || [''])[0])
await page.evaluate(() => {
  const i = document.querySelector('[data-testid="app-dialog"] input[placeholder="搜索标题或正文…"]')
  if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) }
})
await sleep(1800)

// ── 真跑一次：选 1 篇 → 生成 → 审核面板必须**只**显示这一篇 ────────────────
const pickedTitle = await page.evaluate(() => {
  const li = document.querySelector('[data-testid="app-dialog"] ul.divide-y > li button')
  li?.click()
  return li?.querySelector('span.text-ds-sm')?.textContent?.trim() || ''
})
await sleep(400)
log('U11 选定 1 篇准备生成', (await selectedText()).includes('1'), `选中=${pickedTitle}`)
await page.screenshot({ path: resolve(OUT, 'picker-selected.png') })

await clickByText('生成建议')
await sleep(1200)
log('U12 生成前弹出确认', await clickByText('开始生成'))
await sleep(7000)

const after = await dlgText()
log('U13 生成后自动打开审核面板', after.includes('标签 · 领域审核'), after.replace(/\s+/g, ' ').slice(0, 90))

// 关键断言：面板条目数 == 本次生成篇数（1）。只断言「含标题」会在过滤失效时假通过。
const m = /全选（(\d+) 条/.exec(after)
const shown = m ? Number(m[1]) : -1
log('U14 面板已**收敛到刚判定的那 1 篇**（而不是全库待审）', shown === 1,
  `面板条目数=${shown}（期望 1）· 含标题=${pickedTitle ? after.includes(pickedTitle.slice(0, 8)) : 'n/a'}`)

await page.screenshot({ path: resolve(OUT, 'after-generate.png') })
log('U15 运行期无 JS 错误', errors.length === 0, errors.join(' / ') || '(无)')

console.log(`\n总计 ${results.length} 项，失败 ${results.filter(r => r.startsWith('FAIL')).length} 项`)
console.log('截图:', OUT)
await browser.close()
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
