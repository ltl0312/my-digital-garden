# 「拾光」数字花园 · 项目认知记录

> 本文件由 AI 调研项目源码后整理，用于快速了解项目全貌，供开发者 / AI 代理后续协作时参考。
> 整理日期：2026-08-08 ｜ 与本仓库内 `README.md`（项目主页）、`API.md`（接口参考）、`PROJECT-SUMMARY.md`（项目总结）、`PROJECT_PLAN.md`（实施计划书）、`DEPLOY.md`（部署手册）互为补充。

---

## 一、项目定位

**my-digital-garden** 是一个基于 **Nuxt 4 全栈架构**的个人知识管理系统（"数字花园"）：

- 写作端：本地 **Obsidian**（`content/vault/KnowledgeBase` 是 Obsidian 库本体，含 `.obsidian` 配置）
- 服务端：Chokidar 监听 vault 目录 → 自动解析 Markdown 入库 PostgreSQL
- Web 端：SSR 渲染，提供沉浸式阅读、双向链接知识图谱、在线编辑、访问密钥认证与管理后台

已上线生产：https://liutianle.cn（阿里云 ECS）。

---

## 二、技术栈

| 层 | 技术 |
|---|---|
| 框架 | Nuxt 4.5.1（SSR 全栈，`app/` 前端 + `server/` Nitro 后端分离）、Vue 3.5、vue-router 5 |
| 样式 | Tailwind CSS v3 + PostCSS + autoprefixer；"Lumina" 玻璃拟态设计语言（源自根目录 `ui.md` 设计稿） |
| 数据库 | PostgreSQL（生产 15）+ **Prisma 7**（`prisma-client` generator + `@prisma/adapter-pg` 驱动适配器 + `prisma.config.ts`） |
| Markdown 管道 | unified 11 + remark-parse / remark-gfm / remark-math / remark-rehype + rehype-katex / rehype-shiki（nord 主题）/ rehype-stringify；gray-matter 解析 frontmatter |
| 文件监听 | chokidar 5（生产环境轮询模式，开发环境事件模式） |
| 图谱 | d3 v7 力导向图（SVG 渲染） |
| 认证 | 自研 HMAC-SHA256 签名 token（node:crypto），httpOnly cookie |
| 其他 | lucide-vue-next 图标、h3 事件处理 |

---

## 三、目录结构总览

```
my-digital-garden/
├── app/                        # 前端（Nuxt 4 app 目录）
│   ├── app.vue                 # 根组件（NuxtLayout + NuxtPage）
│   ├── assets/css/main.css     # Tailwind + Lumina 设计语言 + 护眼 CSS 变量
│   ├── components/
│   │   ├── ArticleReader.vue   # 沉浸式阅读器（进度条/TOC/backlinks）
│   │   ├── GraphView.vue       # d3 图谱画布（SVG/Canvas 分级、四布局、拖拽固定、状态持久化）
│   │   ├── graph/              # 图谱专用组件
│   │   │   ├── FilterPanel.vue     # 左栏筛选（可见范围/领域/成熟度/标签/关系类型/显示）
│   │   │   ├── NodeDetail.vue      # 右栏节点详情（入链/出链/在图中定位/聚焦邻居）
│   │   │   ├── GraphSearchPanel.vue# 画布内搜索（笔记/标签/领域/命令 四组）
│   │   │   ├── Minimap.vue         # 缩略图（可拖拽平移/滚轮缩放）
│   │   │   ├── GraphTuningPanel.vue# 图谱控制（标签模式/节点与连线/力导向参数，仿 Obsidian）
│   │   │   └── GraphSkeleton.vue   # 加载骨架屏（SSR 安全的伪随机点阵）
│   │   ├── FileTree.vue        # 递归文件树（含目录内新建笔记）
│   │   └── CommandPalette.vue  # ⌘K 命令面板（全局搜索跳转）
│   ├── composables/
│   │   ├── useAuth.ts          # 认证状态（useAsyncData('auth-me') + isAdmin）
│   │   ├── useGraphData.ts     # 图谱数据派生（度数/邻接/入出链/领域/标签/最短路径）
│   │   ├── useGraphFilter.ts   # 图谱筛选状态（范围/领域/成熟度/标签/关系类型）
│   │   └── useTheme.ts         # 暗黑主题切换（localStorage + 双 rAF 过渡）
│   ├── lib/                    # 图谱纯逻辑与常量（无 Vue 依赖）
│   │   ├── graph-types.ts      # GraphNode/GraphEdge/GraphFilterState 等类型
│   │   ├── graph-constants.ts  # RENDER_TIERS/缩放/边样式/布局选项等集中常量
│   │   ├── graphLayouts.ts     # 四种布局纯函数 computeLayout()
│   │   └── graphState.ts       # localStorage 状态读写（字段级合并）
│   ├── layouts/
│   │   ├── default.vue         # 主布局：顶栏 + 可拖侧边栏 + 内容区 + ⌘K
│   │   └── auth.vue            # 登录页布局（居中卡片）
│   ├── middleware/auth.global.ts  # 全局路由守卫（未登录 → /login?redirect=）
│   └── pages/
│       ├── index.vue           # 首页「最近更新」（pageSize=8）
│       ├── notes/index.vue     # 笔记列表（分页/搜索/标签筛选）
│       ├── notes/[...slug].vue # 笔记阅读 + 管理员在线编辑/删除
│       ├── graph.vue           # 知识图谱页（三区布局：筛选栏 / 画布 / 详情栏）
│       ├── login.vue           # 密钥登录
│       └── admin.vue           # 管理后台（生成/禁用/删除访问密钥）
├── server/                     # Nitro 后端
│   ├── middleware/auth.ts      # API 级鉴权（白名单 /api/auth/*，其余需有效 token）
│   ├── plugins/
│   │   ├── watcher.ts          # chokidar 监听 vault → 串行队列处理
│   │   └── seed-auth.ts        # 启动时确保存在初始管理员密钥 <初始 root 密钥>
│   ├── utils/
│   │   ├── db.ts               # PrismaClient 单例（globalThis 防热更新爆池）
│   │   ├── vault.ts            # VAULT_DIR 常量 + resolveVaultPath 防穿越 + NUL 剥离 + 笔记模板
│   │   ├── markdown.ts         # ★ 核心解析管道（见下文数据流）
│   │   └── auth.ts             # HMAC token 签发/校验、requireAuth/requireAdmin、密钥生成
│   └── api/
│       ├── notes/              # index.get（分页/搜索/标签）、[...slug].get（详情+backlinks）、graph.get
│       ├── tags/index.get      # 标签列表（按笔记数降序）
│       ├── auth/               # verify.post（密钥登录）、me.get、logout.post
│       ├── admin/keys/         # 密钥 CRUD（index.get/post、[id].patch/delete，均 requireAdmin）
│       └── vault/              # notes/index.post（新建写文件）、[...slug].put/delete、tree.get
├── prisma/schema.prisma        # 数据模型（见下文）
├── content/vault/              # Obsidian 库（KnowledgeBase 为库根）
├── public/                     # favicon / robots.txt
├── nuxt.config.ts              # 字体预加载、FOUC 防护内联脚本、Tailwind/KaTeX CSS
├── tailwind.config.js
├── prisma.config.ts            # Prisma 7 配置（datasource url 等）
├── ecosystem.config.cjs        # PM2 cluster 配置
├── nginx.conf / Dockerfile / docker-compose*.yml / entrypoint.sh  # 部署文件（容器方案已弃用）
├── ui.md                       # Lumina UI 设计稿（HTML 原型，改版时参照）
└── PROJECT_PLAN.md / PROJECT-SUMMARY.md / DEPLOY.md / PROJECT_NOTES.md  # 项目文档
```

---

## 四、数据库模型（prisma/schema.prisma）

| 模型 | 说明 | 关键字段 |
|---|---|---|
| `Note` | 笔记 | `slug`（唯一，vault 相对路径）、`content`（Markdown 源）、`htmlContent`（渲染后 HTML）、`summary`、`maturity`（枚举 SEEDLING/GROWING/EVERGREEN）、`isPublished`、`metadata`（JSONB，存 YAML 动态字段）、`readingTime`、时间戳 |
| `Tag` | 标签 | `name` 唯一 |
| `NoteTag` | 笔记-标签多对多 | 复合主键 (noteId, tagId)，级联删除 |
| `NoteLink` | 笔记间有向边（WikiLink） | 复合主键 (sourceId, targetId)，级联删除，双向 relation |
| `AccessKey` | 访问密钥 | `key` 唯一（明文）、`label`、`role`（admin/user）、`isActive`（禁用实时失效）、`lastUsedAt` |

---

## 五、核心数据流（Markdown → 数据库 → Web）

```
Obsidian 本地写作
   │（Syncthing 或手动同步/直接放置）
   ▼
content/vault/…/*.md
   │ chokidar 监听（生产：轮询 1s + ignoreInitial；开发：事件模式 + 全量重同步）
   ▼
server/plugins/watcher.ts  —— 串行队列（防连接池 P2028 超时）
   ▼
server/utils/markdown.ts  processMarkdownFile(filePath)：
   1. 读文件，立即剥离 NUL 字节（PG 22021 错误）
   2. gray-matter 解析 frontmatter（失败容错降级为纯正文，事件链不中断）
   3. 正则提取 [[WikiLink]] 目标
   4. resolveTargetSlug 三级解析：精确 slug → basename(endsWith) → metadata.aliases(array_contains)
   5. 将 [[目标|显示名]] 替换为 [显示名](/notes/真实slug)
   6. unified 管道渲染 HTML（GFM + 数学 + KaTeX + Shiki 高亮）
   7. Prisma 事务：upsert Note（内容未变不刷 updatedAt）→ 重建 tags → 重建 NoteLink（Set 去重）
   ▼
PostgreSQL（JSONB 元数据 + 关系边表）
   ▼
Nitro REST API（列表/详情/图谱/标签/树）
   ▼
app/ 前端 SSR 渲染（useRequestFetch 转发 cookie）＋ 客户端手动 fetch（watch 路由变化重取）
```

删除文件：`removeMarkdownFile` 按 slug 删除 DB 记录（幂等 catch）。

---

## 六、API 清单

| 方法 & 路径 | 权限 | 功能 |
|---|---|---|
| GET `/api/notes` | 登录 | 分页（page/pageSize≤100）+ 标题/正文模糊搜索 + 标签筛选；返回 notes/total/totalPages |
| GET `/api/notes/[...slug]` | 登录 | 单篇详情（含 tags、incoming backlinks）；未发布 404 |
| GET `/api/notes/graph` | 登录 | 全站图谱：nodes（id/title/slug/maturity/primaryTag/tags/domain/dirPath/inDegree/outDegree/updatedAt/readingTime/summary）+ edges（source/target/kind: link\|tag）；进程内缓存 60s |
| GET `/api/tags` | 登录 | 标签及计数（按使用量降序） |
| POST `/api/auth/verify` | 公开 | 密钥登录，签发 30 天 httpOnly cookie |
| GET `/api/auth/me` | 公开 | 当前身份（role/label），未登录返回 null |
| POST `/api/auth/logout` | 公开 | 清除 cookie |
| GET/POST `/api/admin/keys` | admin | 密钥列表 / 生成密钥（16 位 base64url 大写） |
| PATCH/DELETE `/api/admin/keys/[id]` | admin | 启用/禁用 / 删除密钥 |
| POST `/api/vault/notes` | admin | 在指定目录新建笔记（写文件，watcher 自动入库） |
| PUT `/api/vault/notes/[...slug]` | admin | 覆盖写回 Markdown 文件 |
| DELETE `/api/vault/notes/[...slug]` | admin | 删除笔记文件 |
| GET `/api/vault/tree` | 登录 | 完整文件树（目录优先，中文排序；叶子带 maturity） |

服务端鉴权链：`server/middleware/auth.ts`（全局 API 守卫）→ `getAuthKey`（cookie → HMAC 校验 → DB 实时查 isActive）→ 各端点 `requireAuth` / `requireAdmin`（双保险）。

---

## 七、认证体系要点

- **密钥永久有效，登录状态 30 天**：AccessKey 无过期概念；token 内嵌 `exp`（30 天），过期需重新输入密钥。
- token = base64url(JSON {kid, exp}) + "." + HMAC-SHA256 签名（`AUTH_SECRET`，默认 dev-secret-change-me）。
- cookie：`garden_token`，httpOnly + sameSite=lax，30 天 maxAge。
- 前端：全局路由守卫 `auth.global.ts`（未登录跳 /login?redirect=）；`useAuth` 提供 `isAdmin` 控制 UI；`useRequestFetch` 保证 SSR 端 cookie 转发（解决刷新丢登录）。
- 初始管理员：`server/plugins/seed-auth.ts` 启动时创建密钥 `<初始 root 密钥>`（role=admin）。

---

## 八、前端功能与设计要点

- **首页**：最近 8 篇 + maturity 徽章（🌱 琥珀 SEEDLING / 🌿 天蓝 GROWING / 🌳 翠绿 EVERGREEN）。
- **阅读器**：滚动进度条、面包屑、TOC（正则提取 h2/h3 + scrollIntoView）、阅读时长估算（字数/400）、标签可点击筛选、backlinks 玻璃卡片网格。
- **图谱**：三区布局（左筛选栏 240/272 · 中画布 flex · 右详情栏 288/320；<1024 左栏改抽屉、右栏改底部弹层；<640 保留底部「图例与统计」折叠面板）。d3 forceSimulation（link 120 / charge -320 / collide r+10 / alphaDecay 0.032 / velocityDecay 0.42）；**渲染分级** `RENDER_TIERS`（≤150 SVG / >150 Canvas / >600 只画度数 Top 200，devicePixelRatio 适配）；**四种布局**（力导向/层次树/径向/时间轴，切换 400ms 补间，`computeLayout()` 纯函数在 `app/lib/graphLayouts.ts`）；**单击选中**（右栏详情）、**双击进正文**、拖拽后固定（Obsidian 行为，钉标 + 「双击解除」提示）；可见范围三选一（全图 / 2 跳邻居 / 最短路径）；领域·成熟度·标签多选 + 关系类型开关（显式链接 / 标签共有，至少保留一种）；hover 信息卡 + 邻域高亮（邻域内 2.5px 描边、邻域外 0.12 不透明度、邻域内连线 2.4px）；缩略图（可拖拽平移 / 滚轮缩放）；四态互不复用（骨架屏 / 筛选空态 / 图谱真空态 / 错误态）；快捷键 ⌘K 搜索、⌘F 聚焦搜索、⌘L 锁物理、`G` then `F` 适配全图、`/` 命令面板、`Delete` 断开关系、Esc 逐层退出。位置 + 缩放 + 固定 + 布局 + 筛选持久化到 localStorage（`garden-graph-state`；设置 `garden-graph-settings-v3`）。
- **标签策略**（`labelMode`，默认 `moc`）：常态只标注 **MOC 节点**（标题匹配 `/^MOC\b/i`，约 36 个），其余节点名字全部隐藏；**聚焦（邻域聚焦）时改为只标注被聚焦的节点**，且不受 `MAX_LABELS`(160) 上限约束；选中 / 悬停始终标注。可切 `all`（上限 160）或 `off`。
- **图谱控制面板**（左栏 `GraphTuningPanel.vue`，仿 Obsidian 图谱设置）：标签模式三选一；节点大小 / 连线粗细；中心力 / 排斥力 / 连接力 / 连接距离 / **聚焦斥力**（默认 2.4）。参数持久化在 `garden-graph-settings-v3`（`readGraphSettings()` 逐字段校验，防止 NaN 流进 d3）。改任一参数即 `refreshForces()` + `reheat()`。**聚焦时被聚焦节点的电荷力额外乘 `focusRepel`**，邻域自动散开。
- 页面标题 `知识图谱 · 拾光`（`useHead`）。
- **侧边栏**：可拖宽度（240–480px，localStorage `garden-sidebar-width`，pointerdown 记录 dragOffset 消除居中偏移）；始终挂载 + 宽度过渡实现丝滑收起；文件树（递归、目录计数、过滤）；标签云（前 20）；Vault Synced 状态栏；管理员可新建笔记。
- **命令面板**：⌘K/⌃K 全局唤起，输入即搜（pageSize=8），Enter 直达首条。
- **主题**：`useTheme`（localStorage 'theme' + prefers-color-scheme 兜底）；nuxt.config 内联脚本 FOUC 防护；`theme-switching` 类 + 双 rAF 统一 0.2s 过渡。
- **中文/多级 slug**：路由与 API 均用 `[...slug]` catch-all，跳转时**逐段 encodeURIComponent**（整体编码会产生 %2F 导致 404）。
- **手动数据模式**：列表/详情页用 ref + watch(route) 手动 fetch（useAsyncData 只在 setup 跑一次，无法响应客户端 query/slug 变化）。

---

## 九、生产部署（已上线 · Docker）

> 2026-10-04 核实：线上实际由 **Docker 容器**承载，**PM2 未在运行**（本节此前记为 PM2 cluster，已更正）。

```
https://liutianle.cn
   └→ Nginx（80→301，443 SSL，acme.sh ECC 证书自动续期）
        └→ proxy_pass http://127.0.0.1:3000
             └→ Docker 容器 garden-app（my-digital-garden-app:latest，network_mode: host）
                  ├→ 宿主原生 PostgreSQL（127.0.0.1:5432，postgresql.service）
                  ├→ Chokidar watcher（容器内 /app/content/vault）
                  └→ bind mount /opt/digital-garden/content/vault（Obsidian 库）
```

- 服务器：阿里云 ECS `8.163.35.246`（Alibaba Cloud Linux 4，2 核 / 1.6G 内存 / 40G），Docker Engine 24.0.9（overlay2）。
- 编排目录 `/opt/garden-docker`：`docker-compose.prod.yml` + `.env`（`DATABASE_URL` / `AUTH_SECRET` / `NODE_OPTIONS`，mode 600）。备份目录 `/opt/garden-backup`。
- **镜像来源：本地构建 → `docker save` → scp → 服务器 `docker load`**；服务器只跑容器、不构建（1.6G 内存不足）。容器名固定 `garden-app`，`restart: unless-stopped`，`network_mode: host`，内存上限 640M + `NODE_OPTIONS=--max-old-space-size=384`（2026-09-22 曾因 watcher 全量重算吃满 1.6G 拖死整机，故限流）。
- **PM2 路径已退役**：`/opt/digital-garden` 是 PM2 时代遗留源码（仅其 `content/vault` 仍被容器 bind mount），`/root/.pm2/dump.pm2` 为历史残留。
- **关键约束**：`.output` 依赖 pnpm 符号链接，**不可把 Windows 构建的裸 `.output` 拷到 Linux 运行**；但 Docker 镜像内的产物是在 Linux 容器里构建的，因此**镜像整体搬运是安全的**（与裸 `.output` 搬运是两回事）。
- 完整步骤、回滚与踩坑见 `DEPLOY.md`。
- 常用运维：`docker ps --filter name=garden-app`；`docker logs --tail 50 garden-app`；`cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate`；`sudo -u postgres psql`；`systemctl reload nginx`；acme.sh 自动续期。

---

## 十、重要踩坑与设计决策（源自代码注释与项目总结）

1. **P2028 事务超时**：批量 `$transaction([...])` 间歇超时 → 列表 API 改独立查询；watcher 改**串行队列**；事务放宽 maxWait/timeout。
2. **NUL 字节**：PG text/JSONB 不接受 0x00（22021）→ 读文件后剥离 + metadata 递归清理。
3. **updatedAt 保护**：内容未变（如重启全量重同步）不刷新 updatedAt；生产 `ignoreInitial: true` 跳过启动全量处理。
4. **WikiLink 三级匹配**：精确 slug → basename → aliases（解决 Obsidian 短文件名链接解析失败、图谱无边的问题）。
5. **frontmatter 容错**：gray-matter 失败不丢正文，按纯正文入库。
6. **SSR 认证**：7 处改用 `useRequestFetch()`，否则刷新丢登录。
7. **Prisma 7 迁移**：generator 用 `prisma-client` + output 目录 + `@prisma/adapter-pg` 驱动适配器；部署需 `prisma.config.ts`。
8. **密钥明文存储**：当前个人单机可接受，生产可升级哈希。

---

## 十一、当前仓库状态（调研时）

- Git：2 次提交（2026-08-08 初版与 UI 优化）；工作区有**未提交修改**：
  - 已修改：`nuxt.config.ts`、`server/plugins/watcher.ts`、`server/utils/markdown.ts`
  - 未跟踪：`.claude/`、`PROJECT-SUMMARY.md`、`garden-deploy.tar.gz`、`public/favicon.svg`
- 知识库：`content/vault/KnowledgeBase` 为 Obsidian 库（00_Inbox ~ 06_Assets、Clippings、速记、skills 等），笔记约 287+ 篇；`CLAUDE.md` 定义了 AI 知识库管理员规范（MOC 星型拓扑、标签体系、职责与工作流），**在库内工作时需遵守**。

---

## 十二、2026-08-09 全面审查与修复记录

> 审查结论：**架构总体合适**（详见 `PROJECT_NOTES.md` 开头文档定位 + 本轮审查），完成的安全/功能/性能修复如下。

### 已修复（P0 安全）

| 项 | 内容 |
|---|---|
| S1 | 生产/本地数据库密码曾硬编码进 git（`ecosystem.config.js`、`docker-compose*.yml`）→ 已全部改为 `.env` 注入；**生产密码需轮换**，操作清单见 `SECURITY-ACTIONS.md`（执行后可删除） |
| S2 | PM2 cluster ×2 导致**双 watcher 重复解析** → `watcher.ts` 仅主实例（`NODE_APP_INSTANCE=0`）监听 |
| S3 | 登录 open redirect → `login.vue` 仅允许站内相对路径跳转 |
| S4 | cookie 无 Secure → `auth.ts` 生产环境 `secure: true` |
| S5 | `AUTH_SECRET` 默认值兜底 → 生产缺失/默认时**启动即失败** |

### 已修复（P1 功能 / P2 性能）

| 项 | 内容 |
|---|---|
| M1 | `summary`/`readingTime` 从未写入 → `markdown.ts` 计算并入库；`ArticleReader` 优先用 DB 值 |
| M2 | 编辑态跨笔记泄漏（可能覆盖他篇）→ `notes/[...slug].vue` slug 变化重置编辑态；**编辑保存丢失 frontmatter**（DB 正文不含 YAML）→ `PUT` 端点读取原文件 frontmatter 并 `matter.stringify` 合并写回 |
| M3/M9 | maturity 非法值 / tags 非字符串导致整篇失败 → 白名单回退 SEEDLING + 标签类型过滤 |
| M4 | 保存后固定 1.5s 等待 → 轮询 watcher 入库（最长 10s，超时提示） |
| M5 | WikiLink 解析 N+1 → `resolveTargetSlugs` 批量 IN 查询（精确/basename/aliases 三级） |
| M6 | 搜索无索引 → `prisma/migrations/20260809000000_search_trgm_indexes`（pg_trgm GIN，需 `migrate deploy`） |
| M7 | tree/graph 每次全量计算 → `server/utils/cache.ts` 进程内缓存（TTL + watcher 失效） |
| M8 | 编辑写文件非原子 → `PUT`/`POST` 先写 `*.tmp` 再 rename；watcher 忽略非 `.md` 后缀 |
| M11 | title 校验不全 → 拒绝 `? * < > " \|` 与控制字符；verify 登录限流（每 IP 10 次/分钟，429） |

### 已修复（P3 质量）

- `CommandPalette`：200ms 防抖 + 请求序号竞态控制
- `GraphView`：窗口 resize 更新中心力；物理开关改 `defineModel` 与页面双向同步
- `auth.global.ts`：客户端 60s me 缓存（仅缓存已登录结果，登录后可立即生效）
- `package.json`：新增 `typecheck` 脚本（需先 `pnpm add -D typescript vue-tsc`；本次因本机 pnpm store 被锁未能安装执行）
- `.gitignore`：忽略部署包与 `*.tmp`；`ecosystem.config.js` 更名 `.cjs`（ESM 兼容，与线上一致）

### 已知限制（本轮未改，记录在案）

1. **未知 `/api/*` 路径返回 401 而非 404**：Nitro 全局中间件在路由匹配前鉴权，精确 404 需重构鉴权层级，收益低暂缓
2. **密钥明文存储**：单机个人场景可接受；升级哈希需改 verify/生成流程
3. **多实例缓存独立**：PM2 双实例下 tree/graph 缓存各进程一份，失效只影响本进程——短 TTL 兜底可接受
4. **前端仍存大量 `any`**：`pnpm typecheck` 首跑后按需收敛（建议先 API 层）
5. **登录限流为内存级**：多实例部署时各进程独立计数（单实例/双实例可接受）

---

## 十二、可扩展方向（记录在案，未实施）

- vault 双向同步（Obsidian ↔ 服务器，如 Syncthing，受内存限制）
- 密钥哈希存储升级
- 图谱搜索覆盖正文全文（当前仅前端本地过滤 title/tags/dirPath/summary；要做须后端 `tsvector` 或 Meilisearch，**不得前端全文扫描**）
- www 子域名证书、内存监控告警

> 注：「图谱 >500 节点时改 Canvas 渲染」已于知识图谱重构中落地（`RENDER_TIERS`：>150 Canvas、>600 只画 Top 200）。
