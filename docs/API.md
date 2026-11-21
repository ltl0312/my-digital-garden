# 拾光 · Digital Garden — REST API 文档

> 本文档基于 `server/api/` 源码整理，描述「拾光」数字花园的全部 HTTP 接口。
> 配套文档：[README.md](../README.md) ｜ [PROJECT_NOTES.md](./PROJECT_NOTES.md)

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

## 4. 笔记与总览接口（需登录）

### 4.1 笔记列表（分页 / 搜索 / 标签筛选）

`GET /api/notes`

| Query 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `page` | number | 1 | 页码（最小 1） |
| `pageSize` | number | 10 | 每页数量（1–100） |
| `q` | string | — | 关键词搜索（大小写不敏感）：标题 / 正文 / slug / 标签名任一命中即返回 |
| `tag` | string | — | 标签精确筛选（如 `前端`） |
| `domain` | string | — | 领域筛选（`shared/domain.ts` 的 `resolveDomain()` 口径，含兜底值 `其他`） |
| `dir` | string | — | 目录前缀筛选（如 `KnowledgeBase/03_Knowledge/前端`，按 slug 前缀匹配） |
| `type` | string | — | 类型筛选：`笔记` / `教程` / `MOC` / `素材` …（对应 `type/<类型>` 标签）；传 `未分类` 表示**没有任何 `type/*` 标签** |
| `maturity` | string | — | 成熟度筛选：`SEEDLING` / `GROWING` / `EVERGREEN`（大小写不敏感，非法值当未传） |
| `sort` | string | `updated` | `updated`（最近更新）/ `title`（标题升序）/ `reading`（阅读时长） |
| `pending` | string | — | 仅管理端「待处理」视图使用 |
| `health` | string | — | 连接健康度：`isolated`（零入度且零出度）/ `linked`（至少一条入边或出边），非法值当未传；口径与 `GET /api/overview` 的 `isolated = total - linked.size` 完全一致（只统计两端均已发布的链接） |

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

- 每条结果在原有字段之外**可能**多带两个可选字段（只在 `q` 命中标题或正文时出现）：
  - `matchField`：`'title'` | `'content'` —— 命中位置
  - `snippet`：纯文本片段（已去 Markdown 标记、折叠连续空白与换行），以命中词为中心左右各 60 字、总长 ≤120；标题命中给标题片段
  - 标签 / slug 命中（正文里压根没有这个词）时**不返回这两个字段**，前端按「无片段」渲染
- 传 `q` 时的排序：**标题命中的行排在当页最前**，其余维持 `sort` 指定的顺序（默认 `updatedAt desc`）。重排只发生在当前页，`page` / `pageSize` / `total` / `totalPages` 语义不变 —— 翻页不会重复或漏项
- `health` 可与 `tag` / `type` / `domain` / `dir` / `maturity` 叠加（内部以 AND 组合）

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
  "maturityExplicit": false,
  "version": "1763000000000:9f2c4a1b7d3e5061",
  "incoming": [
    {
      "source": { "slug": "…", "title": "…", "summary": "…", "updatedAt": "…" }
    }
  ]
}
```

- `incoming` = 所有引用本篇的笔记（反向链接）
- `htmlContent` 已包含 WikiLink 转 `/notes/[slug]` 后的 HTML

- `version`：磁盘文件当前版本 `${十进制毫秒 mtimeMs}:${sha256(文件全文)前 16 位}`，与 `PUT /api/vault/notes/[...slug]` 的 `baseVersion` **同一算法**。保存正文时原样回传即获得乐观锁；`null` = 磁盘文件缺失（DB 有行、文件被外部删除），此时前端应禁用保存而不是报错
- `maturityExplicit`：`true` 表示成熟度是 frontmatter 里的人工值（元数据编辑器据此决定是否回显/锁定）
- 领域字段：`domain`（生效领域）、`domainFrom`（`manual` / `path` / `fallback`）、`pathDomain`（显式领域为空时的路径派生值）、`dirPath`

**失败**

| 状态码 | 说明 |
|---|---|
| 400 | Invalid Slug |
| 404 | 笔记不存在或未发布 |

### 4.3 首页总览统计（仪表盘数据源）

`GET /api/overview`

| 项 | 说明 |
|---|---|
| 权限 | 登录 |
| 缓存 | 进程内 30s（`createCache(30_000)`），写库后由 `invalidateGardenCache()` 失效 |

**成功响应 `200`**

```json
{
  "total": 1234,
  "links": 3901,
  "isolated": 245,
  "sections": [
    { "key": "KnowledgeBase/03_Knowledge", "label": "03_Knowledge", "count": 280 },
    { "key": "ltl/01-编程语言", "label": "01-编程语言", "count": 230 }
  ],
  "types": [
    { "key": "笔记", "label": "笔记", "count": 848 },
    { "key": "教程", "label": "教程", "count": 73 },
    { "key": "未分类", "label": "未分类", "count": 244 }
  ],
  "maturity": [
    { "key": "SEEDLING", "label": "幼苗", "count": 1072 },
    { "key": "GROWING", "label": "生长中", "count": 139 },
    { "key": "EVERGREEN", "label": "常青", "count": 23 }
  ]
}
```

- 只统计 `isPublished = true`；一次 `findMany` 取 `slug / maturity / tags` 后在内存里分桶，**不额外查询**
- `sections` = **目录轴**：按 slug 前两段分桶（单段 slug 自成桶），`label` 取最后一段，按 `count` 降序。**刻意不用「领域」**——`resolveDomain()` 只认 `NN_Knowledge/<领域>`，vault 主力是 `ltl/01-编程语言` 这类二级目录，用领域口径会把九成笔记塞进「其他」兜底桶，卡片等于一堵墙
- `types` = `type/*` 标签轴（`shared/note-types.ts` 的 `TYPE_NAMESPACE` / `typeOfTag()`），另加 `未分类` 桶（无任何 `type/*` 标签）。**一篇笔记挂多个类型标签时会在每个桶各计一次，所以各桶之和可能略大于 `total`**
- `maturity` = 成熟度轴，顺序固定（`MATURITY_ORDER`）
- `links` 只统计**两端都已发布**的 `NoteLink`；`isolated = total - 有任意链接的笔记数`

### 4.4 知识图谱接口（已下线）

`GET /api/notes/graph`、`GET /api/notes/graph/match`、`GET/PUT/DELETE /api/graph/colors`、`GET/PUT/DELETE /api/graph/color-rules` 已在「移除图谱界面」中整组删除（前端图谱页 1212 节点全量渲染是主要卡顿源，实际使用率极低）。首页与分类浏览改用 `GET /api/overview` + `GET /api/notes`。

- Prisma 的 `GraphColor` / `GraphColorRules` 表**保留未删**（旧配色是用户数据，备份导出里仍会带上），但已无任何读写端点
- 领域解析（`shared/domain.ts` 的 `resolveDomain()` / `domainOfSlug()`）**保留**，`GET /api/notes` 与 `GET /api/notes/[...slug]` 仍在用（列表的领域 chip、领域筛选）

### 4.5 相邻笔记（阅读页「上一篇 / 下一篇」）

`GET /api/notes/neighbors?slug=<slug>`

| Query 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `slug` | string | 是 | 当前笔记的 slug（多级路径直接放进查询串即可，无需逐段编码；`\` 会自动归一为 `/`） |

序列 = 全库 `isPublished: true` 的笔记按 `updatedAt desc` 排成一列（与 `GET /api/notes` 的缺省顺序同一序列），取当前篇在该列中的前后一项：

- `prev` = 列中位于本篇**之前**的一篇（更新时间比它更近）
- `next` = 列中位于本篇**之后**的一篇（更新时间比它更早）

**成功响应 `200`**

```json
{
  "prev": { "slug": "03_Knowledge/前端/CSS3/基础语法与选择器", "title": "基础语法与选择器" },
  "next": { "slug": "03_Knowledge/前端/Vue3/响应式原理", "title": "响应式原理" }
}
```

- 位于序列首 / 尾时对应位置为 `null`
- 只取 `slug` + `title` 两列，不返回正文
- `updatedAt` 完全相同的并列项按 `slug` 升序兜底，保证同一篇的 `prev` / `next` 在两次请求之间稳定不变

**失败**

| 状态码 | code | 说明 |
|---|---|---|
| 400 | `INVALID_SLUG` | `slug` 缺失或为空 |
| 404 | `NOTE_NOT_FOUND` | slug 不存在或未发布 |

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

### 6.3 更新笔记（覆盖写回，带乐观锁）

`PUT /api/vault/notes/[...slug]`

| 项 | 说明 |
|---|---|
| 权限 | admin |
| 路径参数 | `slug`（同 4.2，需逐段编码） |
| Body | `{ "content": string, "baseVersion"?: string }` —— `content` 是完整正文，**整体覆盖**文件正文；原 frontmatter 会被保留并原样写回 |
| `baseVersion` | 前端手里那一版的版本串：`${十进制毫秒 mtimeMs}:${sha256(文件全文).slice(0,16)}`，即 `GET /api/notes/[...slug]` 返回的 `version`（见 4.2）。十进制毫秒 + 半角冒号 + sha256 前 16 位十六进制 |

写盘前的判定顺序是固定的：

1. 文件不存在 → `404 NOTE_NOT_FOUND`
2. frontmatter 解析失败 → `400 FRONTMATTER_INVALID`（与 `PATCH /api/vault/notes/[...slug]` 同一口径；**不会**退化成「用空 frontmatter 覆盖」，否则 tags / maturity / created 会整块消失）
3. 请求带 `baseVersion` 且与磁盘当前版本不等 → `409 NOTE_CONFLICT`，**绝不写盘**

请求不带 `baseVersion` 时保持旧行为（无条件覆盖），仅用于兼容旧调用方。

**成功响应 `200`**

```json
{
  "ok": true,
  "slug": "03_Knowledge/前端/CSS3/基础语法与选择器",
  "updatedAt": "2026-11-21T06:12:33.000Z",
  "indexed": true,
  "version": "1763001153000:4b7f9c2e1a8d0356",
  "processed": true
}
```

- `version` = 写入**之后**的磁盘版本。前端必须用它替换本地的 `baseVersion`，否则下一次保存会稳定撞 409
- `indexed` = 是否已同步入库（服务端在返回前 `await processMarkdownFile()`，不再依赖 watcher 的 1–2 秒延迟）。`false` 表示文件已落盘但库内正文未更新，前端应提示「已保存，索引未更新」而**不要重试写入**（磁盘版本已经推进，重试必然 409）
- `processed` = 仅用于排查：`processMarkdownFile()` 是否真的走了完整入库流程（内容未变被幂等跳过时也是 `false`）

**失败**

| 状态码 | code | message / data |
|---|---|---|
| 400 | `INVALID_SLUG` | Invalid Slug |
| 400 | `CONTENT_REQUIRED` | content required（`content` 不是字符串） |
| 400 | `INVALID_BASE_VERSION` | baseVersion 必须是字符串（类型错了不能静默当没传，否则退化成无条件覆盖） |
| 400 | `INVALID_PATH` | Invalid path（slug 越出 vault 根） |
| 400 | `FRONTMATTER_INVALID` | frontmatter 解析失败，请先修复文件头部格式 |
| 404 | `NOTE_NOT_FOUND` | 笔记不存在 |
| 409 | `NOTE_CONFLICT` | 笔记已被其他位置修改；`data = { code, currentVersion, currentUpdatedAt }`，`currentUpdatedAt` 是磁盘文件 mtime 的 ISO 时间 |

> 冲突要走「给用户看」的路径：把 `data.currentVersion` 与本地草稿一起展示，让用户决定合并还是覆盖，**不要**自动重试（旧 `baseVersion` 重试只会反复拿到同一个 409）。

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

### 7.6 断链巡检（wiki 链接目标解析失败汇总）

扫描全库已发布笔记里的 `[[target]]` / `[[target|显示名]]`，用与入库同一套三级解析（精确 slug → 末级路径名 → `metadata.aliases`）判定目标是否存在，把**解析失败**的目标按被引用次数汇总。结果落在 `data/health/broken.json`：不建表、不改 schema、不新增迁移。

读与写是两个接口。

#### `POST /api/admin/health/broken` —— 触发一次全量扫描

| 项 | 说明 |
|---|---|
| 权限 | root / admin（全局中间件按 `ADMIN_ONLY_PREFIXES` 拦截非只读方法） |
| Body | 无 |

- 分批扫描，每批 ≤100 条笔记（`findMany` 只取 `slug` 与 `content`）
- 同一篇笔记内重复引用同一目标只算一次 → `count` 的口径是「引用了该目标的笔记篇数」
- 结果按 `count` 降序（并列按 `target` 升序）写入 `data/health/broken.json`；目录不存在时递归创建；写入走临时文件 + rename，读侧不会读到半截 JSON

**成功响应 `200`**

```json
{ "ok": true, "scannedAt": "2026-11-21T06:20:11.000Z", "total": 12 }
```

`total` = 断链目标个数（= 落盘文件里 `items.length`），不是被扫描的笔记数。

**失败**

| 状态码 | code | 说明 |
|---|---|---|
| 403 | — | 非 root / admin（中间件拒绝，无 `code` 字段） |
| 500 | `HEALTH_WRITE_FAILED` | 扫描完成但落盘失败（此时上一次的 `broken.json` 仍然有效，不会被破坏） |

#### `GET /api/admin/health/broken` —— 读取上次巡检结果

| 项 | 说明 |
|---|---|
| 权限 | root / admin（**在 handler 内 `requireAdmin()` 校验**：全局中间件只拦非只读方法，GET 不在其覆盖范围） |

**成功响应 `200`**

```json
{
  "scannedAt": "2026-11-21T06:20:11.000Z",
  "total": 12,
  "items": [
    {
      "target": "不存在的笔记",
      "count": 3,
      "sources": [
        { "slug": "03_Knowledge/前端/Vue3/响应式原理", "title": "响应式原理" }
      ]
    }
  ]
}
```

- `items[].sources` 最多 10 条（按扫描发现顺序取前 10 篇引用者）
- 从未扫描过 → `{ "scannedAt": null, "items": [], "total": 0 }`。这**不是** 404，前端据此显示「尚未扫描」而不是报错

**失败**

| 状态码 | code | 说明 |
|---|---|---|
| 401 | — | 未登录（无 `code` 字段） |
| 403 | — | 普通用户（`requireAdmin()` 拒绝，无 `code` 字段） |
| 500 | `HEALTH_READ_FAILED` | 结果文件存在但读取失败 |
| 500 | `HEALTH_FILE_INVALID` | 结果文件不是合法 JSON（历史残留），重新扫描即可覆盖 |

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
| 409 | 正文保存时 `baseVersion` 与磁盘当前版本不一致（`data.code = NOTE_CONFLICT`，附 `currentVersion` / `currentUpdatedAt`） |
| 400 | frontmatter 解析失败（`data.code = FRONTMATTER_INVALID`；PATCH 与 PUT 同一口径，不会用空 frontmatter 覆盖文件头） |
| 413 | 导入文件超限（单文件或累计，附回滚标记）；自定义颜色条目数超过 `MAX_NODE_COLORS`(5000) |
| 500 | 数据库或文件系统内部错误 |

---

## 11. curl 示例

```bash
# 1. 登录（保存 Cookie）
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/verify \
  -H 'Content-Type: application/json' \
  -d '{"key":"<你的 root 密钥>"}'

# 2. 当前身份
curl -s -b cookies.txt http://localhost:3000/api/auth/me

# 3. 笔记列表（第 2 页，搜索「Vue」，标签「前端」，按标题排序）
curl -s -b cookies.txt 'http://localhost:3000/api/notes?page=2&pageSize=20&q=Vue&tag=前端&sort=title'

# 4. 领域前缀筛选（侧栏「领域」面板点击即筛选）
curl -s -b cookies.txt 'http://localhost:3000/api/notes?dir=KnowledgeBase/03_Knowledge/前端'

# 5. 首页总览（仪表盘：目录 / 类型 / 成熟度分布 + 链接数）
curl -s -b cookies.txt http://localhost:3000/api/overview

# 6. 分类浏览：某一目录 / 某一类型 / 某一成熟度的笔记
curl -s -b cookies.txt 'http://localhost:3000/api/notes?dir=ltl/01-编程语言&pageSize=20'
curl -s -b cookies.txt 'http://localhost:3000/api/notes?type=教程'
curl -s -b cookies.txt 'http://localhost:3000/api/notes?maturity=EVERGREEN'

# 8. 管理员：新建文件夹
curl -s -b cookies.txt -X POST http://localhost:3000/api/vault/folders \
  -H 'Content-Type: application/json' -d '{"parent":"KnowledgeBase","name":"新目录"}'

# 9. 管理员：重命名目录（事务内同步子孙 slug）
curl -s -b cookies.txt -X PUT http://localhost:3000/api/vault/rename \
  -H 'Content-Type: application/json' -d '{"path":"KnowledgeBase/新目录","name":"改名后"}'

# 10. 管理员：删除空目录（非空目录仅 root；结构目录任何人不可删）
curl -s -b cookies.txt -X DELETE http://localhost:3000/api/vault/nodes \
  -H 'Content-Type: application/json' -d '{"path":"KnowledgeBase/改名后"}'

# 11. 管理员：导入预检（通过后拿 jobId，再逐文件 multipart 上传，最后 finish）
curl -s -b cookies.txt -X POST http://localhost:3000/api/vault/import/preflight \
  -H 'Content-Type: application/json' \
  -d '{"targetDir":"KnowledgeBase","subDir":"新导入","keepStructure":true,"files":[{"relPath":"a.md","size":1024}]}'

# 12. 管理员：生成密钥
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/keys \
  -H 'Content-Type: application/json' -d '{"label":"朋友小明","role":"user"}'

# 13. 退出登录
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/logout

# 14. 连接健康度筛选（isolated = 零入零出；linked = 至少一条链接）
curl -s -b cookies.txt 'http://localhost:3000/api/notes?health=isolated&pageSize=20'

# 15. 相邻笔记（阅读页「上一篇 / 下一篇」，序列 = 全库已发布按 updatedAt desc）
curl -s -b cookies.txt 'http://localhost:3000/api/notes/neighbors?slug=03_Knowledge/前端/CSS3/基础语法与选择器'

# 16. 管理员：带乐观锁的正文保存（baseVersion 来自详情接口的 version）
curl -s -b cookies.txt -X PUT 'http://localhost:3000/api/vault/notes/03_Knowledge/前端/CSS3/基础语法与选择器' \
  -H 'Content-Type: application/json' \
  -d '{"content":"# 正文\n","baseVersion":"1763000000000:9f2c4a1b7d3e5061"}'

# 17. 管理员：断链巡检（先全量扫描，再读取结果）
curl -s -b cookies.txt -X POST http://localhost:3000/api/admin/health/broken
curl -s -b cookies.txt http://localhost:3000/api/admin/health/broken
```

---

## 12. 与前端页面的对应关系

| 页面 / 入口 | 使用接口 |
|---|---|
| `/`（仪表盘：统计条 + 按目录 / 类型 / 成熟度分布 + 最近更新） | `GET /api/overview`、`GET /api/notes?pageSize=6`、`GET /api/vault/tree`、`GET /api/tags` |
| `/browse?kind=dir\|type\|maturity&value=…`（分类列表 → 点标题进正文） | `GET /api/notes`（`dir` / `type` / `maturity` / `sort`） |
| `/notes`（列表/搜索/排序/密度/筛选芯片） | `GET /api/notes`（`q`/`tag`/`dir`/`sort`）、`GET /api/tags` |
| `/notes/[...slug]`（阅读/编辑/目录栏/更多操作） | `GET /api/notes/[...slug]`、`PUT/DELETE /api/vault/notes/[...slug]` |
| `/login` | `POST /api/auth/verify` |
| `/admin`（密钥管理三形态 + 我的密钥） | `GET/POST /api/admin/keys`、`PATCH/DELETE /api/admin/keys/[id]` |
| 侧边栏（结构树/目录/标签 + 右键操作 + 剪贴板） | `GET /api/vault/tree`、`GET /api/tags`、`POST /api/vault/notes`、`POST /api/vault/folders`、`PUT /api/vault/rename`、`POST /api/vault/copy`、`DELETE /api/vault/nodes` |
| 顶栏「新建」下拉（笔记/文件夹/导入） | `POST /api/vault/notes`、`POST /api/vault/folders`、`POST /api/vault/import/*` |
| ⌘K 命令面板 | `GET /api/notes?q=…&pageSize=8` |
