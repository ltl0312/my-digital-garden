// 阶段 E 前后对照截图：登录 / 首页 / 全部笔记 / 笔记详情 / 图谱 / 管理后台 × 亮暗双主题
// 用法：node e-shots.mjs <before|after>
import { resolve } from 'node:path'
import fs from 'node:fs/promises'
// 共享配置：目标地址 / 登录凭据 / 浏览器与 puppeteer-core 位置（见 ./_env.mjs 与 README.md）
import { BASE, ROOT_KEY, CHROME, PROJECT_ROOT, loadPuppeteer } from './_env.mjs'

const label = process.argv[2] || 'before'
const puppeteer = await loadPuppeteer()

if (!ROOT_KEY) {
  console.error('[acceptance] 缺少登录密钥：请在仓库根目录创建 .env.acceptance（模板见 scripts/acceptance/.env.acceptance.example），或设置环境变量 GARDEN_ROOT_KEY。')
  process.exit(1)
}

const OUT = resolve(PROJECT_ROOT, '.workbuddy/backups/e-shots', label)
await fs.mkdir(OUT, { recursive: true })

const PAGES = [
  { name: 'login', path: '/login', auth: false },
  { name: 'home', path: '/', auth: true },
  { name: 'notes', path: '/notes', auth: true },
  { name: 'detail', path: null, auth: true }, // 动态取第一篇笔记
  { name: 'graph', path: '/graph', auth: true },
  { name: 'admin', path: '/admin', auth: true }
]
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 }
]

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })

// 登录（root）：按文案点提交键 —— 登录页首个 button 现为密码可见性切换键
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 })
await page.type('input[type="password"]', ROOT_KEY)
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('进入花园'))
  btn?.click()
})
await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 60000 })

// 取一篇真实笔记作为详情页样本
const detailPath = await page.evaluate(async () => {
  const r = await fetch('/api/notes?pageSize=1')
  const j = await r.json()
  const slug = j?.notes?.[0]?.slug
  return slug ? '/notes/' + slug.split('/').map(encodeURIComponent).join('/') : '/notes'
})
PAGES[3].path = detailPath

const report = []
for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    for (const p of PAGES) {
      await page.setViewport({ width: vp.width, height: vp.height })
      if (p.auth) {
        await page.evaluate((t) => {
          localStorage.setItem('theme', t)
          document.documentElement.classList.toggle('dark', t === 'dark')
        }, theme)
      } else {
        await page.evaluate((t) => {
          localStorage.setItem('theme', t)
          document.documentElement.classList.toggle('dark', t === 'dark')
        }, theme)
      }
      await page.goto(BASE + p.path, { waitUntil: 'networkidle2', timeout: 60000 })
      await new Promise(r => setTimeout(r, 700))
      const metrics = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color,
        fontFamily: getComputedStyle(document.body).fontFamily,
        minFontSize: (() => {
          let min = 99
          document.querySelectorAll('*').forEach(el => {
            const t = (el.textContent || '').trim()
            if (!t || el.children.length) return
            const fs = parseFloat(getComputedStyle(el).fontSize)
            if (fs && fs < min) min = fs
          })
          return min
        })()
      }))
      await page.screenshot({ path: resolve(OUT, `${p.name}-${vp.name}-${theme}.png`), fullPage: false })
      report.push({
        页面: p.name, 视口: vp.name, 主题: theme,
        横向溢出: metrics.scrollW > metrics.clientW ? `YES(${metrics.scrollW}>${metrics.clientW})` : 'no',
        正文背景: metrics.bodyBg, 文字色: metrics.bodyColor, 最小字号: metrics.minFontSize
      })
    }
  }
}
await browser.close()
await fs.writeFile(resolve(OUT, '_report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 1))
console.log(`\n截图目录：${OUT}`)
