// 生产环境**只读**部署校验 —— 只发 GET，绝不创建/修改/删除任何数据。
//
// 为什么需要单独一个脚本：仓库里另外两套 API 套件都会真实写数据 ——
//   · e4-regression.mjs 会 POST /api/admin/keys、POST /api/vault/folders|notes、PUT rename、DELETE nodes；
//   · suggest-verify.mjs 会建/删临时密钥、建/删测试笔记与领域目录、并**改写笔记 frontmatter**。
// DEPLOY.md §5.4 已明确「e4-regression 绝不能对生产跑」，suggest-verify 同理。
// 所以生产上线后要一个「只读断言」版本：验证新端点存在、字段形状正确、权限仍然生效。
//
// 用法：
//   $env:GARDEN_BASE='https://liutianle.cn'; node scripts/acceptance/prod-readonly.mjs
// 凭据取自 .env.acceptance 的 GARDEN_ROOT_KEY（只用于登录换 cookie，不写任何东西）。
import { BASE, ROOT_KEY } from './_env.mjs'

const results = []
const log = (id, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} | ${id}${extra ? ' | ' + extra : ''}`)
  console.log(results.at(-1))
}

let cookie = ''
const api = async (path, opts = {}) => {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) },
    signal: AbortSignal.timeout(30_000)
  })
  const sc = res.headers.get('set-cookie')
  if (sc) cookie = sc.split(';')[0]
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON */ }
  return { status: res.status, json, text }
}
const jb = (b) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })

console.log(`目标: ${BASE}\n`)

// ── 未登录探针：新端点必须存在且要求鉴权 ────────────────────────────────────
{
  const login = await api('/login')
  log('P1 /login 可访问（200）', login.status === 200, `status=${login.status}`)

  // 首页未登录应跳登录页。**必须用 redirect:'manual'**：fetch 默认 follow，
  // 会把 302 吃掉并报出跳转后的 200（本脚本第一版就在这里误判成 FAIL）。
  const homeRaw = await fetch(BASE + '/', { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  log('P2 首页未登录跳转（302/307）',
    [302, 307].includes(homeRaw.status),
    `status=${homeRaw.status} location=${homeRaw.headers.get('location') || '-'}`)

  const probes = [
    ['P3 /api/admin/settings/llm 存在且需鉴权', '/api/admin/settings/llm', 401],
    ['P4 /api/admin/suggestions 存在且需鉴权', '/api/admin/suggestions', 401],
    ['P5 /api/admin/suggestions/meta 存在且需鉴权', '/api/admin/suggestions/meta', 401],
    ['P6 /api/notes/graph 需鉴权', '/api/notes/graph', 401]
  ]
  for (const [id, path, expect] of probes) {
    const r = await api(path)
    log(id, r.status === expect, `status=${r.status}`)
  }
}

if (!ROOT_KEY) {
  console.log('\n（未配置 GARDEN_ROOT_KEY，跳过需要登录的只读断言）')
} else {
  // ── 登录（只读：POST /api/auth/verify 只校验密钥、下发 cookie，不写库） ──
  const auth = await api('/api/auth/verify', { method: 'POST', ...jb({ key: ROOT_KEY }) })
  log('P7 root 登录', auth.status === 200 && auth.json?.role === 'root', `status=${auth.status} role=${auth.json?.role}`)

  // ── AI 增强设置（只读） ────────────────────────────────────────────────
  const cfg = await api('/api/admin/settings/llm')
  const llm = cfg.json?.llm
  log('P8 GET /api/admin/settings/llm 返回脱敏视图',
    cfg.status === 200 && !!llm && typeof llm.hasKey === 'boolean' && typeof llm.enabled === 'boolean'
    && typeof llm.usable === 'boolean' && typeof llm.keyTail === 'string',
    JSON.stringify(llm))
  // 脱敏：响应里不该出现任何形似密钥的长串
  log('P9 设置响应不含密钥明文（无 sk-/长串）',
    !/\bsk-[A-Za-z0-9_-]{8,}/.test(cfg.text) && !/"(apiKey|apiKeyEnc)"\s*:/.test(cfg.text),
    '已检查整个响应体')

  // ── 标签·领域待审（只读） ──────────────────────────────────────────────
  const meta = await api('/api/admin/suggestions/meta')
  log('P10 GET /api/admin/suggestions/meta 返回待审数与 AI 状态',
    meta.status === 200 && typeof meta.json?.pending === 'number' && typeof meta.json?.llm?.enabled === 'boolean',
    `pending=${meta.json?.pending} llm=${meta.json?.llm?.enabled ? meta.json?.llm?.model : 'off'}`)

  const list = await api('/api/admin/suggestions?limit=3')
  log('P11 GET /api/admin/suggestions 返回待审清单',
    list.status === 200 && Array.isArray(list.json?.items),
    `items=${list.json?.items?.length} pending=${list.json?.pending}`)
  const first = list.json?.items?.[0]
  if (first) {
    log('P12 待审条目形状完整（含 rationale / domainFrom）',
      typeof first.slug === 'string' && Array.isArray(first.tags) && Array.isArray(first.rationale)
      && typeof first.currentDomain === 'string' && typeof first.confidence === 'number',
      `slug=${first.slug} tags=${first.tags.length} conf=${first.confidence} from=${first.domainFrom}`)
  } else {
    log('P12 待审条目形状完整', true, '当前无待审条目（跳过形状断言）')
  }

  // ── 领域字段已贯通到读接口 ─────────────────────────────────────────────
  const notes = await api('/api/notes?pageSize=5')
  const rows = notes.json?.notes || []
  log('P13 列表接口回传 domain / domainFrom',
    notes.status === 200 && rows.length > 0 && rows.every(n => typeof n.domain === 'string' && !!n.domainFrom),
    `例=${rows[0]?.domain}/${rows[0]?.domainFrom}`)

  const graph = await api('/api/notes/graph')
  const nodes = graph.json?.nodes || []
  log('P14 图谱接口回传 domainFrom',
    graph.status === 200 && nodes.length > 0 && nodes.every(n => !!n.domainFrom),
    `nodes=${nodes.length} edges=${graph.json?.edges?.length} 例=${nodes[0]?.domain}/${nodes[0]?.domainFrom}`)

  const tree = await api('/api/vault/tree')
  log('P15 结构树可用', tree.status === 200 && !!tree.json?.tree, `roots=${tree.json?.tree?.length}`)

  const tags = await api('/api/tags')
  log('P16 标签库可用', tags.status === 200 && Array.isArray(tags.json), `tags=${tags.json?.length}`)

  // ── 笔记多选器依赖的列表契约（全部只读） ──────────────────────────────
  const adminList = await api('/api/notes?pageSize=20')
  const aRows = adminList.json?.notes || []
  log('P17 管理员列表回传 hasPending（多选器据此显示待审徽标）',
    adminList.status === 200 && aRows.length > 0 && aRows.every(n => typeof n.hasPending === 'boolean'),
    `rows=${aRows.length} 例=${aRows[0]?.hasPending}`)

  const all = await api('/api/notes?pageSize=1')
  const none = await api('/api/notes?pending=none&pageSize=1')
  const has = await api('/api/notes?pending=has&pageSize=1')
  log('P18 待审筛选自洽：none + has == 全部',
    none.status === 200 && has.status === 200
    && (none.json?.total || 0) + (has.json?.total || 0) === (all.json?.total || 0),
    `none=${none.json?.total} has=${has.json?.total} 全部=${all.json?.total}`)

  // 回归：领域筛选与关键词搜索必须**同时**生效（曾经两个 OR 平铺互相覆盖，搜索会丢掉领域条件）。
  // ⚠️ 断言不能写成「结果必须为 0」：领域筛选取的是**生效领域** = 显式指定（Note.domainLevel1）
  //    或（未显式指定且路径落在该领域目录下）。一篇路径不在运维目录、但领域被人工/审核指定为
  //    「运维」的笔记**理应**命中 —— 生产上确实存在这样一条（此前用户审核通过过一条建议），
  //    早期把断言写成「必须为 0」属**测试过严**（实测 43 → 1 被判 FAIL）。
  const qOnly = await api('/api/notes?q=' + encodeURIComponent('泛型') + '&pageSize=1')
  const both = await api('/api/notes?domain=' + encodeURIComponent('运维') + '&dir=' + encodeURIComponent('KnowledgeBase/03_Knowledge/运维') + '&q=' + encodeURIComponent('泛型') + '&pageSize=100')
  const bothRows = both.json?.notes || []
  const domainConsistent = bothRows.every(n => n.domainLevel1 === '运维'
    || (n.domainLevel1 == null && String(n.slug).startsWith('KnowledgeBase/03_Knowledge/运维/')))
  log('P19 领域筛选与关键词搜索同时生效（领域＝生效领域语义）',
    (qOnly.json?.total || 0) > 0 && (both.json?.total || 0) < (qOnly.json?.total || 0) && domainConsistent,
    `仅 q=泛型 → ${qOnly.json?.total}；运维 + q=泛型 → ${both.json?.total}（应更少）· 命中项领域自洽=${domainConsistent}`)
}

console.log('\n---- 汇总 ----')
const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`总计 ${results.length} 项，失败 ${failed.length} 项（本脚本全程只发 GET，未改动任何数据）`)
if (failed.length) console.log(failed.join('\n'))
process.exit(failed.length ? 1 : 0)
