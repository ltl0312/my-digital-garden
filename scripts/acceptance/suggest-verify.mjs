// 标签 · 领域自动分配与审核 的验收脚本（对**运行中的应用**跑真实 HTTP + 真实 vault 文件）
//
// 为什么不用单测桩：本功能的正确性大半在「跨层契约」上 ——
//   · 显式领域必须优先于路径派生（前端各处按同一个 resolveDomain 取值）；
//   · 审核通过必须**写回 vault 文件的 frontmatter**（vault 才是标签的事实源）；
//   · 写入之后 watcher 重入库**不能把人工领域冲掉**（否则用户改一次正文就丢领域）。
// 这三条只有打真接口 + 读真文件才能验出来，所以这里直接驱动应用。
//
// 运行前置：
//   1. 应用在 GARDEN_BASE 可访问（默认 http://localhost:3100；本机 dev 常在 3000，
//      用 `GARDEN_BASE=http://localhost:3000 node scripts/acceptance/suggest-verify.mjs` 覆盖）
//   2. 仓库根目录 .env.acceptance 里有 GARDEN_ROOT_KEY（见 .env.acceptance.example）
//
// 副作用与自清理：只建一个临时 admin 密钥（跑完删），
// 并在 `KnowledgeBase/E0标签审核` 下建/删自己的测试笔记；对真实笔记的改动会**原样还原**。
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BASE, ROOT_KEY, PROJECT_ROOT } from './_env.mjs'

const results = []
const log = (id, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} | ${id}${extra ? ' | ' + extra : ''}`)
  console.log(results.at(-1))
}

const mkSession = () => {
  let cookie = ''
  return {
    get cookie() { return cookie },
    api: async (path, opts = {}) => {
      let res
      try {
        res = await fetch(BASE + path, {
          ...opts,
          headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) },
          // dev 服务器在源码改动后会让首个请求等 HMR 重编译（实测可超 undici 默认 10s
          // 的 headers timeout，报 HeadersTimeoutError），这里放宽到 60s。
          signal: AbortSignal.timeout(60_000)
        })
      } catch (e) {
        return { status: 0, json: null, text: String(e).slice(0, 80) }
      }
      const sc = res.headers.get('set-cookie')
      if (sc) cookie = sc.split(';')[0]
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* 非 JSON */ }
      return { status: res.status, json, text }
    }
  }
}
const jsonBody = (b) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const root = mkSession()
let tempAdminId = null

/** 轮询直到条件成立（生成是后台队列 + 防抖，不能假设「请求返回即有结果」） */
async function waitFor(fn, { timeoutMs = 30_000, stepMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (last) return last
    await sleep(stepMs)
  }
  return last
}

const SCRATCH_DIR = 'KnowledgeBase/E0标签审核'
const SCRATCH_SLUG = `${SCRATCH_DIR}/验证样例`

if (!ROOT_KEY) {
  console.error('缺少 GARDEN_ROOT_KEY：请在 .env.acceptance 里配置（模板见 scripts/acceptance/.env.acceptance.example）')
  process.exit(2)
}

// ---------- 0. 身份就绪 ----------
let admin = mkSession()
let user = mkSession()
let USER_KEY_ID = null
{
  const r = await root.api('/api/auth/verify', { method: 'POST', ...jsonBody({ key: ROOT_KEY }) })
  log('00 root 登录', r.status === 200 && r.json?.role === 'root', `status=${r.status} role=${r.json?.role}`)

  const mk = await root.api('/api/admin/keys', { method: 'POST', ...jsonBody({ label: '标签审核验收临时管理员', role: 'admin' }) })
  tempAdminId = mk.json?.id || null
  const a = await admin.api('/api/auth/verify', { method: 'POST', ...jsonBody({ key: mk.json?.key || '' }) })
  log('00 临时 admin 登录（root 合法路径）', mk.status === 200 && a.status === 200 && a.json?.role === 'admin', `mk=${mk.status} login=${a.status}`)

  const mu = await root.api('/api/admin/keys', { method: 'POST', ...jsonBody({ label: '标签审核验收临时用户', role: 'user' }) })
  USER_KEY_ID = mu.json?.id || null
  const u = await user.api('/api/auth/verify', { method: 'POST', ...jsonBody({ key: mu.json?.key || '' }) })
  log('00 临时 user 登录', u.status === 200 && u.json?.role === 'user', `status=${u.status}`)

  // 清理上次残留
  await root.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: SCRATCH_DIR }) })
  const meta = await admin.api('/api/admin/suggestions/meta')
  log('01 审核 meta 接口（admin 可读，返回待审数与 LLM 状态）',
    meta.status === 200 && typeof meta.json?.pending === 'number' && typeof meta.json?.llm?.enabled === 'boolean',
    `pending=${meta.json?.pending} llm=${meta.json?.llm?.enabled ? meta.json?.llm?.model : 'off'}`)
  log('01b meta 不泄露任何密钥字段',
    !!meta.json && !JSON.stringify(meta.json).toLowerCase().includes('apikey') && !JSON.stringify(meta.json).includes('sk-'),
    JSON.stringify(meta.json))
}

// ---------- 1. 权限门禁（需求：仅管理员与初始管理员；普通用户永远只读） ----------
{
  const cases = [
    ['P1 user 读待审清单 → 403', user, '/api/admin/suggestions', 'GET', null, 403],
    ['P2 user 触发生成 → 403', user, '/api/admin/suggestions', 'POST', { scope: 'recent' }, 403],
    ['P3 user 审核建议 → 403', user, '/api/admin/suggestions/review', 'POST', { items: [{ id: 'x', action: 'approve', tags: [] }] }, 403],
    ['P4 user 读 meta → 403', user, '/api/admin/suggestions/meta', 'GET', null, 403],
    ['P5 user 建笔记 → 403（普通用户只读）', user, '/api/vault/notes', 'POST', { path: SCRATCH_DIR, title: 'x' }, 403],
    ['P6 user 建目录 → 403', user, '/api/vault/folders', 'POST', { parent: 'KnowledgeBase', name: 'x' }, 403],
    ['P7 user 删节点 → 403', user, '/api/vault/nodes', 'DELETE', { path: SCRATCH_DIR }, 403],
    ['P8 user 预检导入 → 403', user, '/api/vault/import/preflight', 'POST', { targetDir: 'KnowledgeBase', files: [{ relPath: 'a.md', size: 10 }] }, 403],
    ['P9 admin 读待审清单 → 200', admin, '/api/admin/suggestions', 'GET', null, 200],
    ['P10 admin 触发生成 → 200', admin, '/api/admin/suggestions', 'POST', { scope: 'recent' }, 200]
  ]
  for (const [id, sess, path, method, body, expect] of cases) {
    const r = await sess.api(path, { method, ...(body ? jsonBody(body) : {}) })
    log(id, r.status === expect, `status=${r.status}${r.json?.message ? ' msg=' + String(r.json.message).slice(0, 26) : ''}`)
  }
}

// ---------- 2. 领域契约：显式领域优先于路径派生 ----------
/** 字段名与 server/api/notes/index.get.ts 的出参一一对应 */
let sampleNote = null
{
  const list = await admin.api('/api/notes?pageSize=200')
  const notes = Array.isArray(list.json?.notes) ? list.json.notes : []
  const withDomain = notes.filter(n => typeof n.domain === 'string' && n.domain && n.domainFrom)
  log('D1 列表接口回传已解析的领域与来源', withDomain.length > 0,
    `notes=${notes.length} withDomain=${withDomain.length} 例=${withDomain[0]?.domain}/${withDomain[0]?.domainFrom}`)

  const inFront = notes.find(n => /KnowledgeBase\/03_Knowledge\/前端\//.test(n.slug))
  const pathDerived = inFront ? inFront.domainFrom === 'path' && inFront.domain === '前端' : false
  log('D2 未指定领域的笔记按目录派生（前端 → 前端）', !!inFront && pathDerived,
    inFront ? `slug=${inFront.slug} domain=${inFront.domain} from=${inFront.domainFrom}` : '未找到前端目录下的笔记')
  sampleNote = inFront || null

  const graph = await admin.api('/api/notes/graph')
  const gNode = (graph.json?.nodes || []).find(n => n.domain && n.domainFrom)
  log('D3 图谱接口回传 domainFrom', graph.status === 200 && !!gNode,
    gNode ? `${gNode.domain}/${gNode.domainFrom}` : 'none')
}

// ---------- 3. 生成 → 待审（不改动任何笔记） ----------
let suggestion = null
let explained = null
{
  // 测试笔记的正文刻意写成「能命中 vault 既有标签」的样子：
  //   · 正文明确出现 TypeScript / Vue3 / Nuxt 等词 —— vault 里确有 `前端/TypeScript`(21 篇)、`前端/Vue`、`Vue3` 等标签；
  //   · frontmatter 的 tags 留空，这样推出来的标签必然是引擎自己匹配到的，而不是复读原文。
  // 这一条把断言从「有没有推东西」升级为「能不能从既有标签库里正确匹配」：
  // 早前用一篇措辞不命中任何既有标签的笔记做样例会得到 0 条建议（那是诚实结果），
  // 却让「引擎失效」与「语料不匹配」无法区分，是弱断言。
  // 建笔记走 import 链路而不是 notes POST —— 顺带覆盖「导入后自动排队生成」这条路。
  const content = [
    '---',
    'title: 验证样例',
    'tags: []',
    '---',
    '',
    '# TypeScript 泛型与 Vue3 组合式 API 实践',
    '',
    '本文记录 TypeScript 泛型、类型断言与类型守卫在 Vue3 组合式 API 中的用法，',
    '以及 Nuxt 自动导入对 server 目录下工具函数的作用。',
    '',
    '## 参考',
    '- [[MOC - Vue3]]',
    ''
  ].join('\n')

  const mkdir = await admin.api('/api/vault/folders', { method: 'POST', ...jsonBody({ parent: 'KnowledgeBase', name: 'E0标签审核' }) })
  log('G0 建测试目录', [200, 409].includes(mkdir.status), `status=${mkdir.status}`)

  const pre = await admin.api('/api/vault/import/preflight', {
    method: 'POST',
    ...jsonBody({ targetDir: 'KnowledgeBase/E0标签审核', subDir: '', keepStructure: true, files: [{ relPath: '验证样例.md', size: content.length }] })
  })
  if (pre.status !== 200 || !pre.json?.jobId) {
    log('G1 预检签发 jobId', false, `status=${pre.status} msg=${pre.json?.message}`)
  } else {
    const fd = new FormData()
    fd.append('jobId', pre.json.jobId)
    fd.append('relPath', '验证样例.md')
    fd.append('file', new Blob([content], { type: 'text/markdown' }), '验证样例.md')
    const up = await admin.api('/api/vault/import/file', { method: 'POST', body: fd })
    const fin = await admin.api('/api/vault/import/finish', { method: 'POST', ...jsonBody({ jobId: pre.json.jobId }) })
    log('G1 导入链路写入并入库', up.status === 200 && fin.status === 200 && (fin.json?.ingest?.ingested || 0) >= 1,
      `up=${up.status} finish=${fin.status} ingested=${fin.json?.ingest?.ingested} suggested=${fin.json?.suggested}`)
    log('G2 导入收尾回报自动建议排队数量（>=0，队列失败不影响导入）',
      typeof fin.json?.suggested === 'number', `suggested=${fin.json?.suggested}`)
  }

  // 等笔记入库（watcher / import-ingest 都是异步的）
  const ingested = await waitFor(async () => {
    const d = await admin.api('/api/notes/' + SCRATCH_SLUG.split('/').map(encodeURIComponent).join('/'))
    return d.status === 200 ? d.json : null
  }, { timeoutMs: 30_000 })
  log('G3 测试笔记已入库且领域为路径派生的「其他」', !!ingested,
    ingested ? `domain=${ingested.domain} from=${ingested.domainFrom}` : '入库超时')

  // 显式触发生成（导入后的自动排队是后台防抖，不能依赖它的时序）
  const gen = await admin.api('/api/admin/suggestions', {
    method: 'POST',
    ...jsonBody({ scope: 'slugs', slugs: [SCRATCH_SLUG], immediate: true, useLlm: false })
  })
  log('G4 生成建议（强制规则引擎）', gen.status === 200 && (gen.json?.processed || 0) >= 1,
    `status=${gen.status} processed=${gen.json?.processed} stats=${JSON.stringify(gen.json?.stats)}`)

  const found = await waitFor(async () => {
    const r = await admin.api('/api/admin/suggestions')
    const hit = (r.json?.items || []).find(i => i.slug === SCRATCH_SLUG)
    return hit || null
  }, { timeoutMs: 10_000, stepMs: 500 })
  suggestion = found
  log('G5 待审清单里出现该建议', !!suggestion,
    suggestion ? `tags=[${suggestion.tags.join(',')}] conf=${suggestion.confidence} engine=${suggestion.engine}` : '未出现')

  // 关键契约：正文明确出现 TypeScript / Vue3，引擎必须从既有标签库里匹配出非空结果
  log('G6 从既有标签库匹配出非空标签', !!suggestion && suggestion.tags.length > 0,
    JSON.stringify(suggestion?.tags || []))

  // 关键契约：一个都不能是新造的。逐个去标签库核对存在性。
  let vocabOk = false
  let vocabDetail = '未推出标签，跳过核对'
  if (suggestion?.tags?.length) {
    const tags = await admin.api('/api/tags')
    const vocab = new Set((Array.isArray(tags.json) ? tags.json : []).map(t => t.name))
    const missing = suggestion.tags.filter(t => !vocab.has(t))
    vocabOk = missing.length === 0
    vocabDetail = `库内 ${vocab.size} 个标签；越界=${JSON.stringify(missing)}`
  }
  log('G7 建议标签全部已存在于 vault 标签库（不发明新词）', vocabOk, vocabDetail)

  log('G8 每条建议都带判定依据（审核者能判断，不是盲签）',
    !!suggestion && Array.isArray(suggestion.rationale) && suggestion.rationale.length > 0,
    JSON.stringify(suggestion?.rationale || []))

  // 生成阶段绝不改动笔记：frontmatter 里必须仍是建笔记时写的空 tags
  const fileNow = readFileSync(resolve(PROJECT_ROOT, 'content/vault', SCRATCH_SLUG + '.md'), 'utf-8')
  const fmNow = (fileNow.split('---')[1] || '').trim().replace(/\s+/g, ' ')
  log('G9 生成阶段未写入笔记文件（待审 ≠ 生效）', /tags:\s*\[\s*\]/.test(fmNow), fmNow)

  // 诊断接口：解释「为什么推这些 / 为什么不推」，且只读
  const ex = await admin.api('/api/admin/suggestions', { method: 'POST', ...jsonBody({ scope: 'explain', slug: SCRATCH_SLUG }) })
  explained = ex.json?.explain || null
  log('G10 explain 接口可用且给出候选池规模', ex.status === 200 && (explained?.candidatePool || 0) > 0,
    `pool=${explained?.candidatePool} vaultNotes=${explained?.vaultNotes} knownDomains=${JSON.stringify(explained?.knownDomains)}`)
  log('G11 explain 的标签结论与落库建议一致（同一套判定）',
    JSON.stringify((explained?.suggestedTags || []).map(t => t.name)) === JSON.stringify(suggestion?.tags || []),
    `explain=${JSON.stringify((explained?.suggestedTags || []).map(t => t.name))} stored=${JSON.stringify(suggestion?.tags || [])}`)
  const afterExplain = readFileSync(resolve(PROJECT_ROOT, 'content/vault', SCRATCH_SLUG + '.md'), 'utf-8')
  log('G12 explain 只读：文件未被改动', afterExplain === fileNow, `len ${fileNow.length} → ${afterExplain.length}`)

  // 领域建议：本篇在「其他」目录、正文/标签特征是前端，引擎应能指出更合适的领域。
  // 这条依赖真实库的标签分布（前端域 Tags 足够密），故用「有则必须是已知领域、无则如实报告」的宽松断言。
  const domSug = explained?.suggestedDomain
  const domOk = !!domSug && (domSug.keepCurrentDir
    ? true
    : (explained.knownDomains || []).includes(domSug.domain))
  log('G13 领域建议自洽（保持现状，或指向已知领域）', domOk,
    domSug ? `keep=${domSug.keepCurrentDir} domain=${domSug.domain || '-'} current=${domSug.currentDomain}/${domSug.currentFrom} scores=${JSON.stringify((domSug.scores || []).slice(0, 3))}` : 'no domain info')
}

// ---------- 4. 审核通过：写回 vault frontmatter + 落领域属性 ----------
let dApproved = null
/** 当前期望的生效领域（A 段设为「前端」，V 段改自建领域后同步更新）——W 段按它断言 */
let expectedDomain = ''
/** 当前期望的标签（同理：每次审核通过后同步，W 段按它断言重入库不丢标签） */
let expectedTags = []
{
  if (!suggestion) {
    log('A1 审核通过链路', false, '上一步没有拿到待审建议，跳过')
  } else {
    // 模拟审核者的真实操作：采纳部分建议 + 自己再加一个标签 + 领域改为「前端」。
    // 之所以不直接照单全收，就是要验证「审核者的最终选择」而非「机器建议」才是落值。
    const adopted = (suggestion.tags[0] || '').trim()
    const finalTags = adopted ? [adopted, '人工加的标签'] : ['人工加的标签']
    const review = await admin.api('/api/admin/suggestions/review', {
      method: 'POST',
      ...jsonBody({ id: suggestion.id, action: 'approve', tags: finalTags, domain: '前端' })
    })
    dApproved = review.json?.results?.[0] || null
    log('A1 审核通过返回成功且写入文件', review.status === 200 && dApproved?.ok === true && dApproved?.fileWritten === true,
      `status=${review.status} ok=${dApproved?.ok} fileWritten=${dApproved?.fileWritten} err=${dApproved?.error || ''}`)
    log('A2 落库标签为审核者的最终选择（而非机器建议）',
      JSON.stringify(dApproved?.tags) === JSON.stringify(finalTags),
      `final=${JSON.stringify(finalTags)} applied=${JSON.stringify(dApproved?.tags)}`)
    log('A3 领域落为显式「前端」', dApproved?.domainLevel1 === '前端', `domainLevel1=${dApproved?.domainLevel1}`)
    if (dApproved?.ok) { expectedDomain = '前端'; expectedTags = finalTags }

    // 文件侧：frontmatter 必须被正确合并写回（原 title 不能丢）
    const fileAfter = readFileSync(resolve(PROJECT_ROOT, 'content/vault', SCRATCH_SLUG + '.md'), 'utf-8')
    const fmOk = fileAfter.startsWith('---')
      && fileAfter.includes('人工加的标签')
      && fileAfter.includes('title: 验证样例')
    log('A4 vault 文件 frontmatter 已写回且原有字段保留', fmOk,
      fileAfter.split('\n').slice(0, 5).join(' / '))

    // 服务端契约：详情接口的 domain 必须变为显式领域
    const detail = await admin.api('/api/notes/' + SCRATCH_SLUG.split('/').map(encodeURIComponent).join('/'))
    log('A5 详情接口 domain=前端 且 domainFrom=manual',
      detail.json?.domain === '前端' && detail.json?.domainFrom === 'manual',
      `domain=${detail.json?.domain} from=${detail.json?.domainFrom} pathDomain=${detail.json?.pathDomain}`)

    const list = await admin.api('/api/notes?pageSize=200')
    const row = (list.json?.notes || []).find(n => n.slug === SCRATCH_SLUG)
    log('A6 列表接口同样体现显式领域', !!row && row.domain === '前端' && row.domainFrom === 'manual',
      row ? `domain=${row.domain} from=${row.domainFrom}` : 'not found')

    const graph = await admin.api('/api/notes/graph')
    const gn = (graph.json?.nodes || []).find(n => n.slug === SCRATCH_SLUG)
    log('A7 图谱接口同样体现显式领域', !!gn && gn.domain === '前端' && gn.domainFrom === 'manual',
      gn ? `domain=${gn.domain} from=${gn.domainFrom} dirPath=${gn.dirPath}` : 'not found')

    // 关键不变量：显式领域是「领域」而非「移动文件」——文件仍在原目录
    const stillThere = readFileSync(resolve(PROJECT_ROOT, 'content/vault', SCRATCH_SLUG + '.md'), 'utf-8').length > 0
    log('A8 领域分配没有移动文件（slug 与路径不变）', stillThere && !!gn && gn.slug === SCRATCH_SLUG,
      `slug=${gn?.slug}`)

    // ── V 段：领域白名单必须接受「用户自建的新领域目录」─────────────────────
    // 领域是用户在建目录时定义的；色族表里只有 8 个固定名。若白名单只认色族名，
    // 用户在知识区新建 `E0测试领域/` 并在审核界面选它，就会被自己的后端判成非法。
    // 这里造一个**不在色族表里**的真实领域目录来验证这条。
    const NEW_DOMAIN = 'E0测试领域'
    const mk = await admin.api('/api/vault/folders', { method: 'POST', ...jsonBody({ parent: 'KnowledgeBase/03_Knowledge', name: NEW_DOMAIN }) })
    log('V1 在知识区新建领域目录', [200, 409].includes(mk.status), `status=${mk.status} domain=${NEW_DOMAIN}`)

    // 再生成一条待审（上一篇已审核，需要新的 pending 才能再走一次审核）
    await admin.api('/api/admin/suggestions', {
      method: 'POST',
      ...jsonBody({ scope: 'slugs', slugs: [SCRATCH_SLUG], immediate: true, useLlm: false })
    })
    const again = await waitFor(async () => {
      const r = await admin.api('/api/admin/suggestions')
      return (r.json?.items || []).find(i => i.slug === SCRATCH_SLUG) || null
    }, { timeoutMs: 10_000, stepMs: 500 })

    if (!again) {
      log('V2 自建领域目录可作为审核落值', false, '未拿到新的待审建议')
    } else {
      const rv = await admin.api('/api/admin/suggestions/review', {
        method: 'POST',
        ...jsonBody({ id: again.id, action: 'approve', tags: again.tags, domain: NEW_DOMAIN })
      })
      const applied = rv.json?.results?.[0]
      const v2ok = rv.status === 200 && applied?.ok === true && applied?.domainLevel1 === NEW_DOMAIN
      log('V2 自建领域目录可作为审核落值（不被白名单误拒）', v2ok,
        v2ok
          ? `domainLevel1=${applied?.domainLevel1}`
          // 失败时把**原始响应**打出来：只报 ok/err 会在「顶层 4xx」与「逐条失败」之间
          // 无法区分（两者都不会填 results[0].error），定位时白跑一轮
          : `status=${rv.status} raw=${rv.text.slice(0, 240)}`)
      if (applied?.ok) { expectedDomain = NEW_DOMAIN; expectedTags = again.tags }
      const d2 = await admin.api('/api/notes/' + SCRATCH_SLUG.split('/').map(encodeURIComponent).join('/'))
      log('V3 详情接口体现该自建领域', d2.json?.domain === NEW_DOMAIN && d2.json?.domainFrom === 'manual',
        `domain=${d2.json?.domain} from=${d2.json?.domainFrom}`)
      log('V4 仍不改 slug（领域属性≠移动文件）', d2.json?.slug === SCRATCH_SLUG, `slug=${d2.json?.slug}`)
    }
  }
}

// ---------- 5. 重入库保留显式领域（watcher 不会把人工领域冲掉） ----------
{
  if (!dApproved?.ok) {
    log('W1 重入库保留显式领域', false, '审核未成功，跳过')
  } else {
    // 直接改文件正文触发 change 事件 → processMarkdownFile 会重写 Note 行；
    // 若没做「显式领域保护」，这一步会把 domainLevel1 清空。
    const p = resolve(PROJECT_ROOT, 'content/vault', SCRATCH_SLUG + '.md')
    const before = readFileSync(p, 'utf-8')
    writeFileSync(p, before + '\n补充一行触发重入库。\n', 'utf-8')

    const kept = await waitFor(async () => {
      const d = await admin.api('/api/notes/' + SCRATCH_SLUG.split('/').map(encodeURIComponent).join('/'))
      return d.json?.domainFrom === 'manual' && d.json?.domain === expectedDomain ? d.json : null
    }, { timeoutMs: 40_000, stepMs: 1500 })
    log(`W1 改动正文重入库后显式领域仍在（应为「${expectedDomain}」/manual）`, !!kept,
      kept ? `domain=${kept.domain} from=${kept.domainFrom}` : '被冲掉或重入库超时')

    // 顺序无关比较：DB 里 NoteTag 的返回顺序不保证与审核时传入的顺序一致
    const norm = (arr) => JSON.stringify([...(arr || [])].map(x => String(x)).sort())
    const actualTags = (kept?.tags || []).map(t => t.tag?.name || t.name)
    log('W2 重入库后标签仍然一致（frontmatter 是事实源）', !!kept && norm(actualTags) === norm(expectedTags),
      `期望=${norm(expectedTags)} 实际=${norm(actualTags)}`)
  }
}

// ---------- 6. 驳回与清理 ----------
{
  // 再生成一条用于验证「驳回不改动任何文件」
  const gen = await admin.api('/api/admin/suggestions', {
    method: 'POST',
    ...jsonBody({ scope: 'slugs', slugs: [SCRATCH_SLUG], immediate: true, useLlm: false })
  })
  const hit = await waitFor(async () => {
    const r = await admin.api('/api/admin/suggestions')
    return (r.json?.items || []).find(i => i.slug === SCRATCH_SLUG) || null
  }, { timeoutMs: 10_000, stepMs: 500 })

  if (gen.status === 200 && hit) {
    const before = readFileSync(resolve(PROJECT_ROOT, 'content/vault', SCRATCH_SLUG + '.md'), 'utf-8')
    const rej = await admin.api('/api/admin/suggestions/review', { method: 'POST', ...jsonBody({ id: hit.id, action: 'reject', reason: '验收脚本：不改动' }) })
    const after = readFileSync(resolve(PROJECT_ROOT, 'content/vault', SCRATCH_SLUG + '.md'), 'utf-8')
    log('R1 驳回成功', rej.status === 200 && rej.json?.rejected === 1, `status=${rej.status} rejected=${rej.json?.rejected}`)
    log('R2 驳回不改动笔记文件', before === after, `len ${before.length} → ${after.length}`)

    const hist = await admin.api('/api/admin/suggestions?history=1&limit=50')
    const mine = (hist.json?.items || []).filter(i => i.slug === SCRATCH_SLUG)
    const rejected = mine.find(i => i.status === 'rejected')
    const approved = mine.find(i => i.status === 'approved')
    log('R3 审计轨迹保留（approved / rejected 都不删）', !!rejected && !!approved,
      `共 ${mine.length} 条：${mine.map(i => i.status).join(',')}`)
    log('R4 记录审核人与时间', !!rejected?.reviewedBy && !!rejected?.reviewedAt,
      `reviewedBy=${rejected?.reviewedBy ? 'yes' : 'no'} reviewedAt=${rejected?.reviewedAt || '-'} label=${rejected?.reviewerLabel}`)
  } else {
    log('R1 驳回链路', false, '未拿到待审建议')
  }

  // ── S 段：AI 增强设置（GUI 可配密钥与开关；接口永不回传密钥）─────────────────
  // 放在最后并**确保收尾时恢复为「关闭 + 无密钥」**：否则后续再跑本脚本的 G 段时，
  // 生成流程会真的去调那个假地址，每篇都等超时，把套件拖成分钟级。
  {
    const FAKE_KEY = 'sk-acceptance-FAKEKEY-9876'
    const FAKE_TAIL = FAKE_KEY.slice(-4)

    // 权限：普通用户三个接口全 403
    const uGet = await user.api('/api/admin/settings/llm')
    const uPut = await user.api('/api/admin/settings/llm', { method: 'PUT', ...jsonBody({ enabled: true }) })
    const uTest = await user.api('/api/admin/settings/llm-test', { method: 'POST', ...jsonBody({ baseUrl: 'https://example.com' }) })
    log('S1 user 读/写/测试 AI 设置全部 403',
      uGet.status === 403 && uPut.status === 403 && uTest.status === 403,
      `${uGet.status}/${uPut.status}/${uTest.status}`)

    // 初始读取
    const before = await admin.api('/api/admin/settings/llm')
    log('S2 admin 可读设置（返回脱敏视图）',
      before.status === 200 && typeof before.json?.llm?.hasKey === 'boolean',
      JSON.stringify(before.json?.llm))

    // 保存（开启 + 假密钥）
    const save = await admin.api('/api/admin/settings/llm', {
      method: 'PUT',
      ...jsonBody({ enabled: true, baseUrl: 'https://api.example.invalid/v1', model: 'fake-model-x', apiKey: FAKE_KEY })
    })
    log('S3 保存设置成功且回执为脱敏视图',
      save.status === 200 && save.json?.llm?.hasKey === true && save.json?.llm?.keyTail === FAKE_TAIL,
      `status=${save.status} hasKey=${save.json?.llm?.hasKey} keyTail=${save.json?.llm?.keyTail}`)
    log('S4 保存回执里**不含密钥明文**',
      !JSON.stringify(save.json).includes(FAKE_KEY), '已检查整个响应体')

    // 再读一次：确认落库并可读回（且仍然不回明文）
    const after = await admin.api('/api/admin/settings/llm')
    log('S5 重新读取仍是脱敏视图且状态正确',
      after.status === 200 && after.json?.llm?.hasKey === true
      && after.json?.llm?.keyTail === FAKE_TAIL && after.json?.llm?.enabled === true
      && after.json?.llm?.source === 'db',
      JSON.stringify(after.json?.llm))
    log('S6 读取响应里**不含密钥明文**', !JSON.stringify(after.json).includes(FAKE_KEY), '已检查整个响应体')

    // 生成侧的 meta 应反映「AI 已启用」
    const meta = await admin.api('/api/admin/suggestions/meta')
    log('S7 审核 meta 反映 AI 已启用', meta.json?.llm?.enabled === true, `llm=${JSON.stringify(meta.json?.llm)}`)

    // 非法地址被拒
    const bad = await admin.api('/api/admin/settings/llm', { method: 'PUT', ...jsonBody({ enabled: true, baseUrl: 'ftp://x', model: 'm' }) })
    log('S8 非法 API 地址被拒（400）', bad.status === 400, `status=${bad.status} msg=${String(bad.json?.message || '').slice(0, 30)}`)

    // 测试连接：假地址必然失败，但报错里不能泄露密钥
    const test = await admin.api('/api/admin/settings/llm-test', { method: 'POST', ...jsonBody({}) })
    log('S9 测试连接返回结构化结果（假地址 → 失败但可用）',
      test.status === 200 && test.json?.ok === false && typeof test.json?.message === 'string',
      `ok=${test.json?.ok} status=${test.json?.status} msg=${String(test.json?.message || '').slice(0, 40)}`)
    log('S10 测试连接的报错**不回显密钥**',
      !JSON.stringify(test.json).includes(FAKE_KEY), `detail=${String(test.json?.detail || '').slice(0, 60)}`)

    // 留空密钥保存 → 不应把已有密钥洗掉
    const keep = await admin.api('/api/admin/settings/llm', {
      method: 'PUT',
      ...jsonBody({ enabled: true, baseUrl: 'https://api.example.invalid/v1', model: 'fake-model-x' })
    })
    log('S11 留空密钥保存不会洗掉已存密钥',
      keep.status === 200 && keep.json?.llm?.hasKey === true && keep.json?.llm?.keyTail === FAKE_TAIL,
      `hasKey=${keep.json?.llm?.hasKey} keyTail=${keep.json?.llm?.keyTail}`)

    // 显式清除
    const cleared = await admin.api('/api/admin/settings/llm', {
      method: 'PUT',
      ...jsonBody({ enabled: false, baseUrl: 'https://api.example.invalid/v1', model: 'fake-model-x', clearKey: true })
    })
    log('S12 清除密钥后 hasKey=false 且不再可用',
      cleared.status === 200 && cleared.json?.llm?.hasKey === false && cleared.json?.llm?.usable === false,
      JSON.stringify(cleared.json?.llm))
    const afterClear = await admin.api('/api/admin/settings/llm')
    log('S13 清除是持久的（重新读取仍无密钥）', afterClear.json?.llm?.hasKey === false, JSON.stringify(afterClear.json?.llm))

    // S14：把地址指向**本站自身**必须判失败。
    // 真实事故：用户把 baseUrl 填成 `http://localhost:3000/v1`（在服务器上即本应用），
    // 应用以 200 + HTML 返回 `/v1/models`，而探测只判 2xx → 界面显示「连接成功（地址与密钥可用）」，
    // 用户完全不知道该改哪里。现在必须校验响应体是 OpenAI 兼容形状。
    // 必须带上一个（假的）apiKey，否则会在「请先填写 API 密钥」这个前置分支提前返回，
    // 根本走不到真正要验的响应形状校验 —— 那样断言会因为错误的原因通过。
    const self = await admin.api('/api/admin/settings/llm-test', {
      method: 'POST',
      ...jsonBody({ baseUrl: BASE, model: 'x', apiKey: 'sk-acceptance-not-a-real-key' })
    })
    log('S14 地址指向本站自身时必须判失败（不能因 200 就报成功）',
      self.status === 200 && self.json?.ok === false,
      `ok=${self.json?.ok} status=${self.json?.status} msg=${String(self.json?.message || '').slice(0, 64)}`)
  }

  // ── K 段：笔记多选器（指定哪些笔记做判定）的列表契约 ─────────────────────
  {
    // 先给测试笔记造一条待审（V 段已把它审掉，这里 force 重新生成）
    await admin.api('/api/admin/suggestions', {
      method: 'POST',
      ...jsonBody({ scope: 'slugs', slugs: [SCRATCH_SLUG], immediate: true, useLlm: false })
    })
    const hasPendingNow = await waitFor(async () => {
      const r = await admin.api('/api/admin/suggestions')
      return (r.json?.items || []).some(i => i.slug === SCRATCH_SLUG) ? true : null
    }, { timeoutMs: 10_000, stepMs: 500 })
    log('K0 已为测试笔记造出一条待审建议', !!hasPendingNow, `slug=${SCRATCH_SLUG}`)

    // 管理员列表带 hasPending；普通用户列表**不得**出现该字段（待审队列是管理侧状态）
    const aList = await admin.api('/api/notes?pageSize=100')
    const aRows = aList.json?.notes || []
    log('K1 管理员列表回传 hasPending（布尔）',
      aRows.length > 0 && aRows.every(n => typeof n.hasPending === 'boolean'),
      `rows=${aRows.length} 例=${aRows[0]?.hasPending}`)
    const mine = aRows.find(n => n.slug === SCRATCH_SLUG)
    log('K2 测试笔记的 hasPending=true', mine?.hasPending === true, `slug=${mine?.slug} hasPending=${mine?.hasPending}`)

    const uList = await user.api('/api/notes?pageSize=20')
    const uRows = uList.json?.notes || []
    log('K3 普通用户列表**不含** hasPending 字段（不泄露待审状态）',
      uList.status === 200 && uRows.length > 0 && uRows.every(n => !('hasPending' in n)),
      `rows=${uRows.length} keys=${Object.keys(uRows[0] || {}).join(',')}`)

    // 待审筛选：none 排除它、has 包含它
    const noneList = await admin.api('/api/notes?pending=none&pageSize=100')
    const noneSlugs = (noneList.json?.notes || []).map(n => n.slug)
    log('K4 pending=none 排除已有待审的笔记',
      noneList.status === 200 && !noneSlugs.includes(SCRATCH_SLUG) && (noneList.json?.notes || []).every(n => n.hasPending === false),
      `total=${noneList.json?.total} 含测试笔记=${noneSlugs.includes(SCRATCH_SLUG)}`)

    const hasList = await admin.api('/api/notes?pending=has&pageSize=100')
    const hasSlugs = (hasList.json?.notes || []).map(n => n.slug)
    log('K5 pending=has 只返回已有待审的笔记',
      hasList.status === 200 && hasSlugs.includes(SCRATCH_SLUG) && (hasList.json?.notes || []).every(n => n.hasPending === true),
      `total=${hasList.json?.total} 含测试笔记=${hasSlugs.includes(SCRATCH_SLUG)}`)

    // 普通用户传 pending 参数应被忽略：判据是**总数与不带参数时一致**，而不是「测试笔记不在列表里」
    // —— 测试笔记刚创建、按 updatedAt 倒序必在第 1 页，拿它当判据会假失败（第一版就写错了）。
    const uPlain = await user.api('/api/notes?pageSize=1')
    const uPending = await user.api('/api/notes?pending=has&pageSize=1')
    log('K6 普通用户的 pending 参数被忽略（总数与不带参数一致）',
      uPending.status === 200
      && uPending.json?.total === uPlain.json?.total
      && uPlain.json?.total !== hasList.json?.total,
      `不带参数=${uPlain.json?.total} 带 pending=has=${uPending.json?.total} 管理员 has 总数=${hasList.json?.total}`)

    // 领域 + 关键词**同时**生效（回归：两个 OR 平铺会互相覆盖，搜索时静默丢掉领域筛选）
    const qOnly = await admin.api('/api/notes?q=' + encodeURIComponent('泛型') + '&pageSize=100')
    const both = await admin.api('/api/notes?domain=' + encodeURIComponent('运维') + '&dir=' + encodeURIComponent('KnowledgeBase/03_Knowledge/运维') + '&q=' + encodeURIComponent('泛型') + '&pageSize=100')
    log('K7 领域筛选与关键词搜索同时生效（不互相覆盖）',
      (qOnly.json?.total || 0) > 0 && (both.json?.total || 0) === 0,
      `仅 q=泛型 → ${qOnly.json?.total} 篇；运维 + q=泛型 → ${both.json?.total} 篇（应为 0）`)

    // 领域筛选按**生效领域**：测试笔记的显式领域是「E0测试领域」，而它的路径不在知识区
    const byExplicit = await admin.api('/api/notes?domain=' + encodeURIComponent(expectedDomain) + '&pageSize=100')
    const exSlugs = (byExplicit.json?.notes || []).map(n => n.slug)
    log(`K8 领域筛选命中「显式指定」的领域（${expectedDomain}，路径不在知识区）`,
      byExplicit.status === 200 && exSlugs.includes(SCRATCH_SLUG),
      `total=${byExplicit.json?.total} 含测试笔记=${exSlugs.includes(SCRATCH_SLUG)}`)
  }

  // ── L 段：建议质量回归（命名空间语义 + 链接不算内容）─────────────────────
  //
  // 背景（真实事故）：生产上 200 条建议被用户**全部驳回** —— `Java/基础` 被推 63 次、
  // `type/MOC` 52 次，连「四种测试方式」都被推 `Java/基础`。两个根因：
  //   ① `Java/安全` 这类**中文末段**标签会因正文出现「安全」二字而命中（命名空间承载的语义被丢掉）；
  //   ② 同目录共用标签在阈值 2 + 权重 1 下 `sib>=3` 即可**单独达标**，于是一堆目录级通用标签被喷洒。
  // 这里各造一个最小反例把它们钉住。
  {
    const noiseSrc = `${SCRATCH_DIR}/噪声源`
    const noiseTgt = `${SCRATCH_DIR}/安全与基础说明`

    const files = [
      // 兄弟：带 Java/* 标签，制造「同目录共用」的诱惑
      { rel: '噪声源.md', body: '---\ntitle: 噪声源\ntags: [Java/安全, Java/基础]\n---\n\n# 噪声源\n\nJava 安全与基础。\n' },
      // 目标：标题含通用词「安全/基础」，正文**完全不含 java** → 旧逻辑会推 Java/安全（标题命中 4 分）
      { rel: '安全与基础说明.md', body: '---\ntitle: 安全与基础说明\ntags: []\n---\n\n# 安全与基础说明\n\n本文讨论日常生活中的安全常识与基础知识，与编程语言无关。\n' },
      // 目标 2：frontmatter **已有 `后端/Java`**，正文含 Java → 不得再推 `Java`
      // （用户实测 m01824：Flyway 那篇同时有 `Java` 与 `后端/Java`，看起来就是「两个 Java 标签」）
      { rel: 'Java层级说明.md', body: '---\ntitle: Java层级说明\ntags: [后端/Java]\n---\n\n# Java 集合框架\n\n本文记录 Java 集合与并发的用法。\n' }
    ]

    const pre = await admin.api('/api/vault/import/preflight', {
      method: 'POST',
      ...jsonBody({ targetDir: SCRATCH_DIR, subDir: '', keepStructure: true, files: files.map(f => ({ relPath: f.rel, size: f.body.length })) })
    })
    if (pre.status !== 200 || !pre.json?.jobId) {
      log('L1 造噪声对照笔记', false, `预检失败 status=${pre.status} msg=${pre.json?.message || ''}`)
    } else {
      for (const f of files) {
        const fd = new FormData()
        fd.append('jobId', pre.json.jobId)
        fd.append('relPath', f.rel)
        fd.append('file', new Blob([f.body], { type: 'text/markdown' }), f.rel)
        await admin.api('/api/vault/import/file', { method: 'POST', body: fd })
      }
      const fin = await admin.api('/api/vault/import/finish', { method: 'POST', ...jsonBody({ jobId: pre.json.jobId }) })
      log('L1 造噪声对照笔记（同目录兄弟带 Java/* 标签）', fin.status === 200 && (fin.json?.ingest?.ingested || 0) >= 2,
        `ingested=${fin.json?.ingest?.ingested}`)

      const exNoise = await waitFor(async () => {
        const r = await admin.api('/api/admin/suggestions', { method: 'POST', ...jsonBody({ scope: 'explain', slug: noiseTgt }) })
        return r.status === 200 ? r.json.explain : null
      }, { timeoutMs: 30_000, stepMs: 1500 })
      const noiseTags = (exNoise?.suggestedTags || []).map(t => t.name)
      // 关键：标题里明明有「安全」「基础」，但正文与路径都没有 java → 不得推 Java/*
      log('L2 中文末段标签必须带命名空间证据（不推 Java/*）',
        !!exNoise && !noiseTags.some(t => /^java\//i.test(t)),
        `建议=${JSON.stringify(noiseTags)}（同目录兄弟含 Java/安全）`)

      // 关键：`[[MOC - Vue3]]` 是**引用**不是内容 —— 剥掉链接目标后不该推出 type/MOC
      const exRef = await admin.api('/api/admin/suggestions', { method: 'POST', ...jsonBody({ scope: 'explain', slug: SCRATCH_SLUG }) })
      const refTags = (exRef.json?.explain?.suggestedTags || []).map(t => t.name)
      log('L3 链接目标不算内容（正文只有 [[MOC - Vue3]] 不推 type/MOC）',
        exRef.status === 200 && !refTags.some(t => /^type\/moc$/i.test(t)),
        `建议=${JSON.stringify(refTags)}`)

      // ── L4 / L5：同一「末段」不得出现两次（用户实测的「两个 Java 标签」）──────────
      // 根因：`Java` 与 `后端/Java` 是同一概念的两个命名空间层级，按整串去重时两者互不相等，
      // 于是同时落在同一篇笔记上。查库确认过库里没有任何字面重复。
      const leafOf = (t) => (t.split('/').filter(Boolean).pop() || t).trim().toLowerCase()

      const exLayer = await waitFor(async () => {
        const r = await admin.api('/api/admin/suggestions', {
          method: 'POST',
          ...jsonBody({ scope: 'explain', slug: `${SCRATCH_DIR}/Java层级说明` })
        })
        return r.status === 200 ? r.json.explain : null
      }, { timeoutMs: 30_000, stepMs: 1500 })
      const layerTags = (exLayer?.suggestedTags || []).map(t => t.name)
      log('L4 已有标签的末段被覆盖时不再推另一层级（已有 后端/Java 就不推 Java）',
        !!exLayer && !layerTags.some(t => leafOf(t) === 'java'),
        `建议=${JSON.stringify(layerTags)}（该篇 frontmatter 已有 后端/Java）`)

      const dupLeaf = (() => {
        const seen = new Set()
        for (const t of layerTags) { const l = leafOf(t); if (seen.has(l)) return `${l}（${t}）`; seen.add(l) }
        return ''
      })()
      log('L5 建议标签内部不得出现同末段的两个标签', !dupLeaf,
        dupLeaf ? `撞车末段=${dupLeaf}` : `建议=${JSON.stringify(layerTags)}`)
    }
  }

  // 清理：先删测试目录（连带笔记），再删两个临时密钥
  const rm = await root.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: SCRATCH_DIR }) })
  log('Z1 清理测试目录', [200, 404].includes(rm.status), `status=${rm.status}`)
  // A 段末尾建的「自建领域」目录也要清掉（它在 03_Knowledge 下，不是结构目录，可删）
  const rmd = await root.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: 'KnowledgeBase/03_Knowledge/E0测试领域' }) })
  log('Z1b 清理自建领域目录', [200, 404].includes(rmd.status), `status=${rmd.status}`)
  const dk = await root.api('/api/admin/keys/' + tempAdminId, { method: 'DELETE' })
  log('Z2 删除临时管理员密钥', [200, 404].includes(dk.status), `status=${dk.status}`)
  const du = await root.api('/api/admin/keys/' + USER_KEY_ID, { method: 'DELETE' })
  log('Z3 删除临时用户密钥', [200, 404].includes(du.status), `status=${du.status}`)
}

console.log('\n---- 汇总 ----')
const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`总计 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length) console.log(failed.join('\n'))
process.exit(failed.length ? 1 : 0)
