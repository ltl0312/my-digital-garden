# 拾光 · Digital Garden — REST API 文档

> 本文档基于 `server/api/` 源码整理，描述「拾光」数字花园的全部 HTTP 接口。
> 配套文档：[README.md](./README.md) ｜ [PROJECT_NOTES.md](./PROJECT_NOTES.md)

---

## 1. 通用约定

### Base URL

| 环境 | 地址 |
|---|---|
| 本地开发 | `http://localhost:3000` |
| 生产 | `https://liutianle.cn` |

### 请求 / 响应格式

- 请求与响应均为 `application/json`（`GET /api/vault/tree` 亦为 JSON）
- 所有时间字段均为 ISO 8601 字符串（UTC）

### 认证方式

- 采用 **Cookie 会话**：登录成功后服务端下发 `garden_token`（httpOnly、sameSite=lax、有效期 30 天）
- 除三个公开端点外，**所有 `/api/*` 请求都必须携带有效 Cookie**，否则返回 `401`
- Cookie 中 token 与数据库 `AccessKey` 绑定，**密钥被禁用后立即失效**（实时校验 `isActive`）
- 角色：`admin`（管理员，可写操作）/ `user`（普通用户，只读）

```
Authorization 方式：无需手动加 Header，浏览器自动携带 Cookie。
curl 使用：curl -b cookies.txt -c cookies.txt ...
```

### 错误格式

服务端错误统一由 h3 `createError` 抛出，响应体形如：

```json
{
  "statusCode": 401,
  "statusMessage": "Unauthorized",
  "message": "Unauthorized"
}
```

| 状态码 | 含义 |
|---|---|
| 400 | 参数缺失 / 非法（`message` 为中文提示） |
| 401 | 未登录 / token 无效或过期 / 密钥无效或已禁用 |
| 403 | 已登录但无管理员权限 |
| 404 | 资源不存在（笔记、目录） |
| 409 | 资源冲突（笔记已存在） |
| 500 | 服务器内部错误 |

---

## 2. 认证流程（时序）

```
客户端                          服务器
  │  POST /api/auth/verify {key}  │
  ├──────────────────────────────►│  校验 AccessKey（存在 + isActive）
  │  Set-Cookie: garden_token=…   │  签发 HMAC token（内嵌 30 天 exp）
  │ ◄─────────────────────────────┤  返回 { role, label }
  │                               │
  │  GET /api/auth/me（带 Cookie） │  返回 { role, label } 或 null
  │  …其他 /api/*（带 Cookie）     │  middleware 校验 → 进入端点
  │                               │
  │  POST /api/auth/logout        │  清除 Cookie
```

---

## 3. 认证接口（公开）

### 3.1 密钥登录

`POST /api/auth/verify`

| 项 | 说明 |
|---|---|
| 权限 | 公开 |
| Body | `{ "key": string }` — 访问密钥（必填，前后空白自动 trim） |

**成功响应 `200`**

```json
{ "role": "admin", "label": "初始管理员" }
```

同时通过 `Set-Cookie` 下发 `garden_token`（httpOnly，30 天）。

**失败**

| 状态码 | message |
|---|---|
| 400 | 请输入密钥 |
| 401 | 密钥无效 |
| 401 | 密钥已被禁用 |

> 注意：密钥本身永久有效；30 天限制作用于登录 token，过期后重新输入密钥即可。

### 3.2 获取当前身份

`GET /api/auth/me`

| 项 | 说明 |
|---|---|
| 权限 | 公开（未登录不报错） |

**成功响应 `200`** — 已登录：

```json
{ "role": "admin", "label": "初始管理员" }
```

未登录：`null`

### 3.3 退出登录

`POST /api/auth/logout`

| 项 | 说明 |
|---|---|
| 权限 | 公开 |

**成功响应 `200`**

```json
{ "ok": true }
```

（清除 `garden_token` Cookie）

---

## 4. 笔记接口（需登录）

### 4.1 笔记列表（分页 / 搜索 / 标签筛选）

`GET /api/notes`

| Query 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `page` | number | 1 | 页码（最小 1） |
| `pageSize` | number | 10 | 每页数量（1–100） |
| `q` | string | — | 标题或正文模糊搜索（大小写不敏感） |
| `tag` | string | — | 标签精确筛选（如 `前端`） |

**成功响应 `200`**

```json
{
  "notes": [
    {
      "id": "uuid",
      "slug": "03_Knowledge/前端/CSS3/基础语法与选择器",
      "title": "基础语法与选择器",
      "summary": "…",
      "maturity": "SEEDLING",
      "readingTime": 5,
      "updatedAt": "2026-08-08T12:00:00.000Z",
      "tags": [{ "tag": { "name": "前端" } }]
    }
  ],
  "total": 287,
  "page": 1,
  "pageSize": 10,
  "totalPages": 29
}
```

- 仅返回 `isPublished = true` 的笔记
- 按 `updatedAt` 降序排列
- `maturity` 枚举：`SEEDLING`（幼苗）/ `GROWING`（成长）/ `EVERGREEN`（常青）

### 4.2 笔记详情（含反向链接）

`GET /api/notes/[...slug]`

| 项 | 说明 |
|---|---|
| 路径参数 | `slug` — 多级路径，如 `03_Knowledge/前端/CSS3/基础语法与选择器`；**中文/特殊字符需逐段 URL 编码**（整体编码会因 `%2F` 导致 404） |
| 权限 | 登录 |

**成功响应 `200`** — 返回 Note 全部字段，并附带：

```json
{
  "id": "uuid",
  "slug": "…",
  "title": "…",
  "content": "Markdown 源码…",
  "htmlContent": "<p>渲染后的 HTML…</p>",
  "summary": "…",
  "maturity": "GROWING",
  "isPublished": true,
  "metadata": { "aliases": ["…"], "created": "2026-01-01", "tags": ["前端"] },
  "readingTime": 5,
  "createdAt": "…",
  "updatedAt": "…",
  "tags": [{ "tag": { "name": "前端" } }],
  "incoming": [
    {
      "source": { "slug": "…", "title": "…", "summary": "…", "updatedAt": "…" }
    }
  ]
}
```

- `incoming` = 所有引用本篇的笔记（反向链接）
- `htmlContent` 已包含 WikiLink 转 `/notes/[slug]` 后的 HTML

**失败**

| 状态码 | 说明 |
|---|---|
| 400 | Invalid Slug |
| 404 | 笔记不存在或未发布 |

### 4.3 全站知识图谱数据

`GET /api/notes/graph`

| 项 | 说明 |
|---|---|
| 权限 | 登录 |

**成功响应 `200`**

```json
{
  "nodes": [
    { "id": "uuid", "title": "…", "slug": "…", "maturity": "SEEDLING", "primaryTag": "前端" }
  ],
  "edges": [
    { "source": "源笔记id", "target": "目标笔记id" }
  ]
}
```

- 仅含已发布笔记；`primaryTag` 为笔记第一个标签（可能为 `null`）
- 边为有向（WikiLink 方向），供 d3 力导向图渲染

---

## 5. 标签接口（需登录）

### 5.1 标签列表（含计数）

`GET /api/tags`

**成功响应 `200`** — 按笔记数量降序：

```json
[
  { "name": "前端", "count": 42 },
  { "name": "Java", "count": 17 }
]
```

---

## 6. Vault 接口（文件系统读写）

> 这些接口直接读写服务器磁盘 `content/vault/` 下的 Markdown 文件，**watcher 监听后自动同步入库**（异步，通常 1–2 秒）。

### 6.1 获取 vault 文件树

`GET /api/vault/tree`

| 项 | 说明 |
|---|---|
| 权限 | 登录 |

**成功响应 `200`**

```json
{
  "tree": [
    {
      "name": "KnowledgeBase",
      "type": "dir",
      "children": [
        { "name": "03_Knowledge", "type": "dir", "children": [ … ] },
        { "name": "MOC - 知识库总览", "type": "file", "slug": "KnowledgeBase/03_Knowledge/MOC - 知识库总览", "maturity": "EVERGREEN" }
      ]
    }
  ]
}
```

- 目录在前、文件在后，中文按拼音排序；忽略隐藏文件（`.` 开头）
- 文件节点带 `slug`（去 `.md` 的相对路径）与 `maturity`（若已入库）

### 6.2 新建笔记

`POST /api/vault/notes`

| 项 | 说明 |
|---|---|
| 权限 | admin |
| Body | `{ "path": string, "title": string }` — `path` 为目标目录（相对 vault，空 = 根目录）；`title` 为笔记标题（默认「未命名笔记」） |

校验规则：

- `title` 不能包含 `/`、`\`、`:`，不能为空
- `path` 必须位于 vault 内（拒绝 `..` 穿越与绝对路径）
- 目标目录必须存在；同名文件已存在则冲突

**成功响应 `200`** — 服务器写入模板文件（`title` + 空 tags + SEEDLING frontmatter）：

```json
{ "slug": "03_Knowledge/前端/新笔记标题" }
```

**失败**

| 状态码 | message |
|---|---|
| 400 | Invalid title / Invalid path / Only .md files allowed |
| 404 | Directory not found |
| 409 | Note already exists |

### 6.3 更新笔记（覆盖写回）

`PUT /api/vault/notes/[...slug]`

| 项 | 说明 |
|---|---|
| 权限 | admin |
| 路径参数 | `slug`（同 4.2，需逐段编码） |
| Body | `{ "content": string }` — 完整 Markdown 源码（**整体覆盖**文件） |

**成功响应 `200`**

```json
{ "ok": true, "slug": "…" }
```

> 写入后 watcher 异步重新解析入库，前端通常等待约 1.5s 后刷新。

**失败**

| 状态码 | message |
|---|---|
| 400 | Invalid Slug / content required / Invalid path |

### 6.4 删除笔记

`DELETE /api/vault/notes/[...slug]`

| 项 | 说明 |
|---|---|
| 权限 | admin |
| 路径参数 | `slug`（同 4.2，需逐段编码） |

**成功响应 `200`** — 删除磁盘文件（不存在也视为成功）：

```json
{ "ok": true }
```

---

## 7. 管理接口（三级角色体系）

> 角色模型：`root`（初始管理员，内置唯一）＞ `admin`（普通管理员）＞ `user`（普通用户）。
> 服务端二维校验（角色 × 目标）是权威；前端置灰只是第一道门。细节见 design-spec 第 8 章。

### 7.1 密钥列表

`GET /api/admin/keys`（所有角色可访问，**可见范围随角色收窄**）

**成功响应 `200`** — 按创建时间倒序：

```json
[
  {
    "id": "uuid",
    "key": "ABC123XYZ…",
    "label": "朋友小明",
    "role": "user",
    "isActive": true,
    "isBuiltin": false,
    "createdBy": "uuid|null",
    "creatorLabel": "初始管理员",
    "lastUsedAt": "2026-09-21T10:00:00.000Z",
    "createdAt": "2026-09-01T08:00:00.000Z"
  }
]
```

| 角色 | 可见范围 | 密钥字段 |
|---|---|---|
| `root` | 全部（含其他管理员与普通用户） | 明文 |
| `admin` | 自己 + 全部普通用户 | 自己的明文；**他人的打码** |
| `user` | 仅自己 | 明文（本人可见自己的密钥） |

> ⚠️ `key` 明文仅限本人（与 root 的全量视图）；这是个人单机用途的当前设计，见 PROJECT_NOTES.md「可扩展方向」。

### 7.2 生成密钥

`POST /api/admin/keys`（`root` 可建 `admin`/`user`；`admin` 仅可建 `user`；任何人都不可建 `root`）

| 项 | 说明 |
|---|---|
| Body | `{ "label": string, "role": "admin" \| "user" }` — `label` 必填（备注名）；`role` 默认 `user` |

**成功响应 `200`** — 自动生成 16 位密钥（可能含 `_`）：

```json
{ "id": "uuid", "key": "4K8XQ2P9W…", "label": "朋友小明", "role": "user", "isActive": true }
```

**失败**：`400 请填写密钥备注名` · `403 越权操作：普通管理员仅可创建普通用户密钥` · `403 越权操作：初始管理员为内置唯一身份，不可创建`

### 7.3 启用 / 禁用密钥

`PATCH /api/admin/keys/[id]`

| 项 | 说明 |
|---|---|
| 路径参数 | `id` — 密钥 UUID |
| Body | `{ "isActive": boolean }` — 必填 |

**成功响应 `200`** — 返回更新后的完整密钥对象。禁用后该用户**立即失效**（现有 Cookie 也失效）。

**失败（越权矩阵，均 403）**：`不能变更自己的密钥状态`（防自锁）· `初始管理员不可被禁用` · `普通管理员仅可管理普通用户密钥` · `400 isActive required`

### 7.4 删除密钥

`DELETE /api/admin/keys/[id]`

**成功响应 `200`**

```json
{ "ok": true }
```

**失败（均 403）**：`不能删除自己正在使用的密钥` · `初始管理员不可被删除` · `普通管理员仅可管理普通用户密钥`

### 7.5 成熟度全量重算

`POST /api/admin/maturity/recompute`（对应 spec 10.5 季度复核；人工 frontmatter 值永远优先）

**成功响应 `200`**

```json
{ "ok": true, "scanned": 287, "updated": 1, "skippedManual": 232 }
```

---

## 8. vault 文件树操作（需 admin；结构目录受保护）

> 路径均为 **vault 相对路径**（不含 `content/vault` 前缀，不含 `.md` 扩展名）。
> 结构目录 = `KnowledgeBase/NN_*` 一层：对任何角色（含 root）**禁改/禁删**，其内部内容不受限。

### 8.1 新建文件夹

`POST /api/vault/folders`

| 项 | 说明 |
|---|---|
| Body | `{ "parent": string, "name": string }` — `parent` 为空串表示 vault 顶层 |

**成功响应 `200`**：`{ "ok": true, "path": "KnowledgeBase/新目录" }`

**失败**：`400 非法名（空名/含 / 等）` · `409 同一目录下不允许同名` · `404 父目录不存在` · `400 路径越界（穿越）`

### 8.2 重命名（文件 / 文件夹）

`PUT /api/vault/rename`

| 项 | 说明 |
|---|---|
| Body | `{ "path": string, "name": string }` — 同目录内改名 |

**成功响应 `200`**：`{ "ok": true, "path": "新相对路径" }`。目录改名会在**同一事务内**同步全部子孙笔记的 `Note.slug` 前缀。

**失败**：`404 节点不存在` · `409 同目录重名` · `403 越权操作：结构目录受保护，不可重命名`

### 8.3 复制 / 粘贴

`POST /api/vault/copy`

| 项 | 说明 |
|---|---|
| Body | `{ "path": string, "targetDir": string }` — 文件或整目录递归复制 |

**成功响应 `200`**：`{ "ok": true, "path": "副本相对路径", "notes": 复制的笔记数 }`

**失败**：`409 同目录重名` · `400 不能粘贴到自身或其子目录` · `403 结构目录受保护`

### 8.4 删除节点

`DELETE /api/vault/nodes`

| 项 | 说明 |
|---|---|
| Body | `{ "path": string }` — 文件直删；**空目录** admin 可删；**非空目录仅 root**；结构目录全员禁删 |

**成功响应 `200`**：`{ "ok": true, "type": "dir" \| "file", "notes": 删除的笔记数 }`

**失败**：`403 越权操作：非空文件夹仅初始管理员可删除` · `403 越权操作：结构目录受保护，不可删除` · `404 节点不存在`

---

## 9. 批量导入（需 admin；spec 第 9 章）

> 三步协议：**先校验后上传**。`jobId` 账本有效期 10 分钟；服务端按**真实字节数**复核。
> 限制：单文件 ≤ 5 MiB、单批总量 ≤ 100 MiB、单次 ≤ 500 个；白名单 `.md / .markdown / .txt`。

### 9.1 预检（先校验后上传）

`POST /api/vault/import/preflight`

| 项 | 说明 |
|---|---|
| Body | `{ "targetDir": string, "subDir": string, "keepStructure": boolean, "files": [{ "relPath": string, "size": number }] }` |

**成功响应 `200`**：

```json
{
  "jobId": "uuid",
  "accepted": [{ "relPath": "a.md", "size": 1024, "destRel": "KnowledgeBase/目标/a.md" }],
  "skipped": [],
  "stats": { "picked": 1, "willImport": 1, "skipped": 0, "willTotal": 1024, "maxSize": 1024 },
  "limits": { "maxFile": 5242880, "maxTotal": 104857600, "maxCount": 500, "accept": [".md", ".markdown", ".txt"] }
}
```

**失败（`400`，`data.rule` 标明原因）**：`file`（单文件超限）· `total`（批次超 100MB）· `count`（超 500 个）· `dup-exists`（与目标目录现有笔记重名，**整批阻断**）· `type`（类型不支持，跳过不阻断）

### 9.2 逐文件上传

`POST /api/vault/import/file`（`multipart/form-data`）

| 项 | 说明 |
|---|---|
| 字段 | `jobId`、`relPath`（必须与预检通过清单一致）、文件二进制 |

**成功响应 `200`**：`{ "ok": true, "bytes": 实际字节数 }`

**失败**：`413 单文件超限 / 累计越线（回滚本 job 已写文件）` · `404 导入会话不存在或已过期` · `400 文件未通过预检，拒绝写入` · `409 该导入会话已结束`

### 9.3 结束导入（触发批量入库）

`POST /api/vault/import/finish`

| 项 | 说明 |
|---|---|
| Body | `{ "jobId": string }` |

**成功响应 `200`**：

```json
{ "ok": true, "written": 4, "writtenBytes": 9018368, "ingest": { "total": 4, "ingested": 4, "failed": [], "pending": 0, "elapsedMs": 1450 } }
```

> `ingest` 为主动并发入库（并发 8 + 20s 兜底）的结果；watcher 会跳过本批已入库文件，避免二次解析。

---

## 10. 错误码汇总

| 状态码 | 触发场景 |
|---|---|
| 400 | 参数缺失/非法、标题含非法字符、路径越界、删除当前登录密钥、导入预检未通过等 |
| 401 | 未登录、token 过期、密钥无效/被禁用（`/api/auth/*` 之外由全局守卫拦截） |
| 403 | 越权操作（角色 × 目标二维校验）：非 admin 访问管理/写接口、结构目录受保护、非空目录非 root、密钥越权矩阵等 |
| 404 | 笔记不存在/未发布、目标目录不存在、导入会话过期 |
| 409 | 新建笔记/文件夹已存在、粘贴到自身目录、导入会话已结束 |
| 413 | 导入文件超限（单文件或累计，附回滚标记） |
| 500 | 数据库或文件系统内部错误 |

---

## 11. curl 示例

```bash
# 1. 登录（保存 Cookie）
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/verify \
  -H 'Content-Type: application/json' \
  -d '{"key":"liutl"}'

# 2. 当前身份
curl -s -b cookies.txt http://localhost:3000/api/auth/me

# 3. 笔记列表（第 2 页，搜索「Vue」，标签「前端」，按标题排序）
curl -s -b cookies.txt 'http://localhost:3000/api/notes?page=2&pageSize=20&q=Vue&tag=前端&sort=title'

# 4. 领域前缀筛选（侧栏「领域」面板点击即筛选）
curl -s -b cookies.txt 'http://localhost:3000/api/notes?dir=KnowledgeBase/03_Knowledge/前端'

# 5. 图谱数据
curl -s -b cookies.txt http://localhost:3000/api/notes/graph

# 6. 管理员：新建文件夹
curl -s -b cookies.txt -X POST http://localhost:3000/api/vault/folders \
  -H 'Content-Type: application/json' -d '{"parent":"KnowledgeBase","name":"新目录"}'

# 7. 管理员：重命名目录（事务内同步子孙 slug）
curl -s -b cookies.txt -X PUT http://localhost:3000/api/vault/rename \
  -H 'Content-Type: application/json' -d '{"path":"KnowledgeBase/新目录","name":"改名后"}'

# 8. 管理员：删除空目录（非空目录仅 root；结构目录任何人不可删）
curl -s -b cookies.txt -X DELETE http://localhost:3000/api/vault/nodes \
  -H 'Content-Type: application/json' -d '{"path":"KnowledgeBase/改名后"}'

# 9. 管理员：导入预检（通过后拿 jobId，再逐文件 multipart 上传，最后 finish）
curl -s -b cookies.txt -X POST http://localhost:3000/api/vault/import/preflight \
  -H 'Content-Type: application/json' \
  -d '{"targetDir":"KnowledgeBase","subDir":"新导入","keepStructure":true,"files":[{"relPath":"a.md","size":1024}]}'

# 10. 管理员：生成密钥
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/keys \
  -H 'Content-Type: application/json' -d '{"label":"朋友小明","role":"user"}'

# 11. 退出登录
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/logout
```

---

## 12. 与前端页面的对应关系

| 页面 / 入口 | 使用接口 |
|---|---|
| `/`（首页 Hero + 统计条 + 最近更新） | `GET /api/notes?pageSize=6`、`GET /api/vault/tree`、`GET /api/tags`、`GET /api/notes/graph` |
| `/notes`（列表/搜索/排序/密度/筛选芯片） | `GET /api/notes`（`q`/`tag`/`dir`/`sort`）、`GET /api/tags` |
| `/notes/[...slug]`（阅读/编辑/目录栏/更多操作） | `GET /api/notes/[...slug]`、`PUT/DELETE /api/vault/notes/[...slug]` |
| `/graph`（图谱） | `GET /api/notes/graph` |
| `/login` | `POST /api/auth/verify` |
| `/admin`（密钥管理三形态 + 我的密钥） | `GET/POST /api/admin/keys`、`PATCH/DELETE /api/admin/keys/[id]` |
| 侧边栏（结构树/领域/标签 + 右键操作 + 剪贴板） | `GET /api/vault/tree`、`GET /api/tags`、`POST /api/vault/notes`、`POST /api/vault/folders`、`PUT /api/vault/rename`、`POST /api/vault/copy`、`DELETE /api/vault/nodes` |
| 顶栏「新建」下拉（笔记/文件夹/导入） | `POST /api/vault/notes`、`POST /api/vault/folders`、`POST /api/vault/import/*` |
| ⌘K 命令面板 | `GET /api/notes?q=…&pageSize=8` |
