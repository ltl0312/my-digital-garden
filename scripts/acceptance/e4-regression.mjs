// E4 全量回归：对**生产构建产物**跑跨阶段关键路径（B 权限矩阵 / C 文件操作 / D 导入限制 / 只读接口）
import { BASE, ROOT_KEY } from './_env.mjs'
// 用户密钥**不再硬编码**：旧脚本写死 `YEYALC1MBEYHP2`，该密钥一旦被清理（本环境已只剩
// 「初始管理员」一条），就会连带让 8 项 user 断言全部拿到 401 而**误报成回归**。
// 改为脚本自己用 root 建一个临时 user 密钥、跑完删除 —— 与环境初始状态彻底解耦。
let USER_KEY = ''
let USER_KEY_ID = null
/** 跑之前的密钥条数：终态按此核对，而不是假设「应该是 2 条」 */
let INITIAL_KEY_COUNT = 0
const SCRATCH = 'KnowledgeBase/E4回归'
const SCRATCH_FILE = `${SCRATCH}/回归样例`

const results = []
const log = (id, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} | ${id}${extra ? ' | ' + extra : ''}`); console.log(results.at(-1)) }

const mkSession = () => {
  let cookie = ''
  return {
    get cookie() { return cookie },
    api: async (path, opts = {}) => {
      let res
      try {
        res = await fetch(BASE + path, {
          ...opts,
          headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) }
        })
      } catch (e) {
        return { status: 0, json: null, text: String(e).slice(0, 60) }
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

const root = mkSession()
const admin = mkSession()
const user = mkSession()

const cookieOf = (s) => (s.cookie ? { cookie: s.cookie } : {})

// ---------- 身份就绪 ----------
{
  const r = await root.api('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: ROOT_KEY }) })
  log('00 root 登录', r.status === 200 && r.json?.role === 'root', JSON.stringify(r.json))

  // 基线：跑之前的密钥条数（终态按此核对，不假设绝对值）
  const beforeKeys = await root.api('/api/admin/keys')
  INITIAL_KEY_COUNT = Array.isArray(beforeKeys.json) ? beforeKeys.json.length : 0

  // 临时 user 密钥（自给自足）：跑完在 Z 段删除
  const mkUserKey = await root.api('/api/admin/keys', { method: 'POST', ...jsonBody({ label: 'E4回归临时用户', role: 'user' }) })
  USER_KEY = mkUserKey.json?.key || ''
  USER_KEY_ID = mkUserKey.json?.id || null
  const u = await user.api('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: USER_KEY }) })
  log('00 user 登录（临时密钥，跑完删除）', u.status === 200 && u.json?.role === 'user', JSON.stringify(u.json))

  // 清理上次残留（root 全可操作）
  await root.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: SCRATCH }) })
  const mk = await root.api('/api/admin/keys', { method: 'POST', ...jsonBody({ label: 'E4回归临时管理员', role: 'admin' }) })
  const a = await admin.api('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: mk.json?.key }) })
  log('00 建临时 admin 并登录（root 合法路径）', mk.status === 200 && a.status === 200 && a.json?.role === 'admin', `mk=${mk.status} login=${a.status}`)
  global.__adminKeyId = mk.json?.id
}

// ---------- 只读接口 ----------
{
  const list = await root.api('/api/notes?pageSize=3')
  log('R1 列表接口', list.status === 200 && Array.isArray(list.json?.notes), `total=${list.json?.total}`)
  const dir = await root.api('/api/notes?dir=' + encodeURIComponent('KnowledgeBase/03_Knowledge/前端') + '&pageSize=1')
  log('R2 领域前缀筛选', dir.status === 200 && dir.json?.total > 0, `total=${dir.json?.total}`)
  const sort = await root.api('/api/notes?sort=title&pageSize=6')
  const titles = (sort.json?.notes || []).map(n => n.title)
  const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'en'))
  log('R3 排序接口（title 升序，按 en 排序规则比对）', sort.status === 200 && titles.length > 0 && titles.join('|') === sorted.join('|'), titles.join(' > '))
  const tree = await root.api('/api/vault/tree')
  log('R4 结构树', tree.status === 200 && !!tree.json?.tree, `roots=${tree.json?.tree?.length}`)
  const graph = await root.api('/api/notes/graph')
  log('R5 图谱接口', graph.status === 200 && graph.json?.nodes?.length > 200, `nodes=${graph.json?.nodes?.length} edges=${graph.json?.edges?.length}`)
  const tags = await root.api('/api/tags')
  log('R6 标签接口', tags.status === 200 && Array.isArray(tags.json), `tags=${tags.json?.length}`)
  const detail = await root.api('/api/notes/' + (list.json?.notes?.[0]?.slug || '').split('/').map(encodeURIComponent).join('/'))
  log('R7 详情接口', detail.status === 200 && !!detail.json?.htmlContent, `title=${detail.json?.title?.slice(0, 12)}`)
  const noAuth = mkSession()
  log('R8 未登录访问列表被拒', (await noAuth.api('/api/notes')).status === 401 || (await noAuth.api('/api/notes')).status === 204 || (await noAuth.api('/api/notes')).status === 403)
}

// ---------- B 阶段：权限矩阵 ----------
{
  const mine = await root.api('/api/auth/me')
  const myId = mine.json?.id

  const adminKeys = await admin.api('/api/admin/keys')
  const adminList = Array.isArray(adminKeys.json) ? adminKeys.json : []
  const adminRow = adminList.find(k => k.id === global.__adminKeyId) || adminList[0]

  const cases = [
    ['B1 admin 禁用自己 → 403', admin, '/api/admin/keys/' + adminRow?.id, 'PATCH', { isActive: false }, 403],
    ['B2 admin 建管理员 → 403', admin, '/api/admin/keys', 'POST', { label: 'x', role: 'admin' }, 403],
    ['B3 root 建 root → 403', root, '/api/admin/keys', 'POST', { label: 'x', role: 'root' }, 403],
    ['B4 user 建密钥 → 403', user, '/api/admin/keys', 'POST', { label: 'x', role: 'user' }, 403],
    ['B5 user 改密钥 → 403', user, '/api/admin/keys/' + (myId || 'x'), 'PATCH', { isActive: false }, 403],
    ['B6 user 删密钥 → 403', user, '/api/admin/keys/' + (myId || 'x'), 'DELETE', null, 403],
    ['B7 root 删自己 → 403', root, '/api/admin/keys/' + myId, 'DELETE', null, 403],
    ['B8 root 禁自己 → 403', root, '/api/admin/keys/' + myId, 'PATCH', { isActive: false }, 403],
    ['B9 admin 禁 root → 403', admin, '/api/admin/keys/' + myId, 'PATCH', { isActive: false }, 403]
  ]
  for (const [id, sess, path, method, body, expect] of cases) {
    const r = await sess.api(path, { method, ...(body ? jsonBody(body) : {}) })
    log(id, r.status === expect, `status=${r.status} msg=${(r.json?.message || '').slice(0, 24)}`)
  }
  // 可见范围
  const rv = await root.api('/api/admin/keys')
  const av = await admin.api('/api/admin/keys')
  const um = await user.api('/api/auth/me')
  const uv = await user.api('/api/admin/keys')
  log('B10 可见范围 root ≥ admin ≥ user', (rv.json?.length || 0) > (av.json?.length || 0) && (uv.json?.length === 1), `root=${rv.json?.length} admin=${av.json?.length} user=${uv.json?.length}`)
  // user 只能看到自己那一条（结构上就不存在「他人密钥」），且是自己的完整密钥
  log('B11 user 列表仅含自己的密钥且为其完整值',
    Array.isArray(uv.json) && uv.json.length === 1 && uv.json[0].id === um.json?.id && uv.json[0].key === USER_KEY,
    `id匹配=${uv.json?.[0]?.id === um.json?.id}`)
}

// ---------- C 阶段：文件操作 ----------
{
  const mk = await admin.api('/api/vault/folders', { method: 'POST', ...jsonBody({ parent: 'KnowledgeBase', name: 'E4回归' }) })
  log('C1 admin 建文件夹', mk.status === 200, `status=${mk.status}`)
  const dup = await admin.api('/api/vault/folders', { method: 'POST', ...jsonBody({ parent: 'KnowledgeBase', name: 'E4回归' }) })
  log('C2 同目录重名 → 409', dup.status === 409, `status=${dup.status}`)
  const bad = await admin.api('/api/vault/folders', { method: 'POST', ...jsonBody({ parent: 'KnowledgeBase', name: 'a/b' }) })
  log('C3 非法名（含 /）→ 400', bad.status === 400, `status=${bad.status}`)
  const esc = await admin.api('/api/vault/folders', { method: 'POST', ...jsonBody({ parent: '../../etc', name: 'x' }) })
  log('C4 路径穿越 → 400/404', [400, 404].includes(esc.status), `status=${esc.status}`)

  const note = await admin.api('/api/vault/notes', { method: 'POST', ...jsonBody({ path: SCRATCH, title: '回归样例' }) })
  log('C5 admin 建笔记', note.status === 200 && !!note.json?.slug, `slug=${note.json?.slug}`)

  const ren = await admin.api('/api/vault/rename', { method: 'PUT', ...jsonBody({ path: SCRATCH_FILE, name: '回归样例改名' }) })
  log('C6 重命名', ren.status === 200, `status=${ren.status} msg=${(ren.json?.message || '').slice(0, 20)}`)

  const cp = await admin.api('/api/vault/copy', { method: 'POST', ...jsonBody({ path: `${SCRATCH}/回归样例改名`, targetDir: 'KnowledgeBase' }) })
  log('C7 跨目录复制', cp.status === 200, `status=${cp.status} msg=${(cp.json?.message || '').slice(0, 20)}`)
  const self = await admin.api('/api/vault/copy', { method: 'POST', ...jsonBody({ path: `${SCRATCH}/回归样例改名`, targetDir: SCRATCH }) })
  log('C8 粘贴到自身目录 → 409', self.status === 409, `status=${self.status}`)

  // 结构目录保护 + 非空仅 root
  const sd = await admin.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: 'KnowledgeBase/03_Knowledge' }) })
  log('C9 admin 删结构目录 → 403', sd.status === 403, `status=${sd.status}`)
  const sdr = await root.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: 'KnowledgeBase/03_Knowledge' }) })
  log('C10 root 删结构目录 → 403（受保护）', sdr.status === 403, `status=${sdr.status}`)
  const nonEmpty = await admin.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: SCRATCH }) })
  log('C11 admin 删非空目录 → 403', nonEmpty.status === 403, `status=${nonEmpty.status}`)

  // user 越权
  const u1 = await user.api('/api/vault/folders', { method: 'POST', ...jsonBody({ parent: 'KnowledgeBase', name: 'x' }) })
  const u2 = await user.api('/api/vault/rename', { method: 'PUT', ...jsonBody({ path: SCRATCH, name: 'y' }) })
  const u3 = await user.api('/api/vault/copy', { method: 'POST', ...jsonBody({ path: SCRATCH, targetDir: 'KnowledgeBase' }) })
  const u4 = await user.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: SCRATCH }) })
  log('C12 user 四项文件操作全部 403', [u1, u2, u3, u4].every(r => r.status === 403), `${u1.status}/${u2.status}/${u3.status}/${u4.status}`)
}

// ---------- D 阶段：导入限制 ----------
{
  const files = [
    { relPath: 'a.md', size: 1024 },
    { relPath: '../../etc/passwd', size: 512 }
  ]
  const esc = await admin.api('/api/vault/import/preflight', { method: 'POST', ...jsonBody({ targetDir: 'KnowledgeBase', subDir: '', keepStructure: true, files }) })
  log('D1 预检拦截路径穿越 → 400', esc.status === 400, `status=${esc.status} msg=${(esc.json?.message || '').slice(0, 24)}`)

  const big = Array.from({ length: 26 }, (_, i) => ({ relPath: `big/f-${i}.md`, size: 4 * 1024 * 1024 }))
  const over = await admin.api('/api/vault/import/preflight', { method: 'POST', ...jsonBody({ targetDir: 'KnowledgeBase', subDir: 'E4超限', keepStructure: true, files: big }) })
  log('D2 批次超 100MB → 400 且 rule=total', over.status === 400 && over.json?.data?.rule === 'total', `status=${over.status} rule=${over.json?.data?.rule}`)

  const single = await admin.api('/api/vault/import/preflight', { method: 'POST', ...jsonBody({ targetDir: 'KnowledgeBase', subDir: 'E4超限', keepStructure: true, files: [{ relPath: 'x.md', size: 6 * 1024 * 1024 }] }) })
  log('D3 单文件超 5MB → 400', single.status === 400, `status=${single.status} rule=${single.json?.data?.rule}`)

  const ok = await admin.api('/api/vault/import/preflight', { method: 'POST', ...jsonBody({ targetDir: 'KnowledgeBase', subDir: 'E4预检', keepStructure: true, files: [{ relPath: 'ok.md', size: 2048 }] }) })
  log('D4 合规预检通过并签发 jobId', ok.status === 200 && typeof ok.json?.jobId === 'string', `status=${ok.status} jobId=${String(ok.json?.jobId).slice(0, 8)}`)

  const upUser = await user.api('/api/vault/import/preflight', { method: 'POST', ...jsonBody({ targetDir: 'KnowledgeBase', subDir: '', keepStructure: true, files: [{ relPath: 'a.md', size: 100 }] }) })
  log('D5 user 预检 → 403', upUser.status === 403, `status=${upUser.status}`)
}

// ---------- 清理 ----------
{
  const rm = await root.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: SCRATCH }) })
  log('Z1 root 删非空测试目录（合法）', rm.status === 200, `status=${rm.status}`)
  // 复制到 KnowledgeBase 根的那个副本
  const cp = await root.api('/api/vault/nodes', { method: 'DELETE', ...jsonBody({ path: 'KnowledgeBase/回归样例改名' }) })
  log('Z2 清理复制副本', [200, 404].includes(cp.status), `status=${cp.status}`)
  const kd = global.__adminKeyId
  const dk = await root.api('/api/admin/keys/' + kd, { method: 'DELETE' })
  log('Z3 删除临时管理员密钥', dk.status === 200, `status=${dk.status}`)
  const dku = await root.api('/api/admin/keys/' + USER_KEY_ID, { method: 'DELETE' })
  log('Z4 删除临时用户密钥', dku.status === 200, `status=${dku.status}`)
  const final = await root.api('/api/admin/keys')
  log(`Z5 密钥数回到跑前基线（${INITIAL_KEY_COUNT} 条）`,
    final.json?.length === INITIAL_KEY_COUNT, JSON.stringify((final.json || []).map(k => k.label)))
}

console.log('\n---- 汇总 ----')
console.log(`总计 ${results.length} 项，失败 ${results.filter(r => r.startsWith('FAIL')).length} 项`)
console.log(results.filter(r => r.startsWith('FAIL')).join('\n') || '(无失败项)')
