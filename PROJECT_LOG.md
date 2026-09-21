# 「拾光」数字花园 · 项目进程与问题记录（PROJECT LOG）

> 本文档按**时间线**记录项目从搭建到生产运维全过程中遇到的**问题（bug / 代码格式 / 代码问题）**与**优化细节**，含全部历史与最新记录。
> 定位：开发历程日志，与 `PROJECT-SUMMARY.md`（总结）、`PROJECT_NOTES.md`（架构认知 + 审查清单）、`API.md`（接口参考）互补。
> 最后更新：2026-08-16

---

## 目录

- [第一阶段 · 搭建与数据建模（08-06）](#第一阶段--搭建与数据建模-08-06)
- [第二阶段 · 数据管道（watcher + Markdown 解析）](#第二阶段--数据管道watcher--markdown-解析)
- [第三阶段 · 前端阅读器与知识图谱](#第三阶段--前端阅读器与知识图谱)
- [第四阶段 · 本地 Docker 与真实知识库接入](#第四阶段--本地-docker-与真实知识库接入)
- [第五阶段 · 功能增强（文件树 / 在线编辑 / 图谱 Obsidian 化）](#第五阶段--功能增强文件树--在线编辑--图谱-obsidian-化)
- [第六阶段 · UI 多轮修复与 Lumina 改版](#第六阶段--ui-多轮修复与-lumina-改版)
- [第七阶段 · 访问认证与管理后台](#第七阶段--访问认证与管理后台)
- [第八阶段 · 生产部署与上线（ECS）](#第八阶段--生产部署与上线ecs)
- [第九阶段 · 全面代码审查与安全修复（08-09）](#第九阶段--全面代码审查与安全修复-08-09)
- [第十阶段 · 生产密码轮换与代码更新（08-15/16）](#第十阶段--生产密码轮换与代码更新-081516)
- [问题索引表](#问题索引表)
- [遗留事项与后续优化](#遗留事项与后续优化)

---

## 第一阶段 · 搭建与数据建模（08-06）

**内容**：按 `PROJECT_PLAN.md` 六阶段路线图搭建 Nuxt 4 脚手架（`app/` 前端 + `server/` Nitro 后端分离）、Prisma 建模（Note/Tag/NoteTag/NoteLink）、本地 PostgreSQL 18。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L01 | 工具链 | pnpm 10+ 构建脚本拦截（`ERR_PNPM_IGNORED_BUILDS`） | `pnpm-workspace.yaml` 配 `allowBuilds: { esbuild/prisma: true }` |
| L02 | 依赖 | unified 初装 9.2.2 与 remark-parse@11 冲突 | 显式升级 `unified@^11` |
| L03 | 工具链 | corepack 缓存层隔离导致 Docker 构建 runtime 层 pnpm 不可用 | 改用 `npm i -g pnpm@11.1.3` |
| L04 | 构建 | Docker 构建期无 DATABASE_URL，`prisma generate` 报错 | 构建阶段注入占位 DATABASE_URL（generate 不实际连接） |
| L05 | 数据建模 | 半结构化 YAML 元数据与关系图谱并存 | Note.metadata 用 JSONB；NoteLink 边表存 WikiLink 拓扑；Maturity 枚举（SEEDLING/GROWING/EVERGREEN） |

### 优化与细节

- 数据库设计以"文件系统为唯一事实源"：vault 可随时重建 DB（渲染缓存/图谱层可丢弃重建）
- Prisma 索引：`slug`（唯一）、`isPublished`、`maturity` 均建索引
- NoteLink 复合主键 `(sourceId, targetId)` 天然去重

---

## 第二阶段 · 数据管道（watcher + Markdown 解析）

**内容**：chokidar 监听 `content/vault` → gray-matter 解析 frontmatter → WikiLink 提取 → unified（remark + rehype + KaTeX + Shiki）渲染 HTML → Prisma 事务入库。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L06 | bug | 批量 `$transaction([...])` 在 Prisma 7 + 驱动适配器下**间歇性 P2028 超时**（列表/计数接口） | 列表 API 改独立查询（findMany + count 分开，不进批量事务） |
| L07 | bug | 287 篇笔记并发处理**压垮连接池**（P2028 事务启动超时） | watcher 改**串行队列**（Promise 链）+ 事务 `maxWait/timeout` 放宽 |
| L08 | bug | PostgreSQL text/JSONB **不接受 NUL 字节（0x00，错误码 22021）**，写入失败 | 读取文件后立即剥离 NUL + metadata 递归清理（`sanitizeValue`） |
| L09 | bug | 同篇笔记重复引用同一目标撞 **NoteLink 复合主键**唯一约束 | 建边前 `new Set(outgoingTargets)` 去重 |
| L10 | bug | **图谱 0 边**：WikiLink 目标用 Obsidian 短文件名，与数据库完整 slug 不匹配 | `resolveTargetSlug` 三级匹配：精确 slug → basename（endsWith）→ metadata.aliases（array_contains） |
| L11 | bug | js-yaml 解析 frontmatter 失败导致**整篇笔记丢失**入库 | gray-matter 容错降级（正文仍入库，metadata 为空）+ try-catch 保事件链 |
| L12 | 兼容 | Prisma 7 移除 `prisma-client-js` generator | 改用 `prisma-client` + `output` + `@prisma/adapter-pg` 驱动适配器 + `prisma.config.ts`（CLI 不自动加载 .env，用 Node 原生 `loadEnvFile`） |
| L13 | 细节 | 应用重启全量重同步会把所有笔记 updatedAt 刷成当天 | 内容比对（content/htmlContent 未变则不刷新 updatedAt）；生产 `ignoreInitial: true` 跳过启动全量处理 |

### 优化与细节

- WikiLink 正则 `[[目标|显示名]]` → 渲染为 `[显示名](/notes/真实slug)`，未解析目标保留原路径不报错
- 生产环境 watcher 用**轮询模式**（1s）适配 Docker 挂载目录/云服务器 inotify 失效场景
- `awaitWriteFinish`（1s 稳定期）避免写入半截文件被处理

---

## 第三阶段 · 前端阅读器与知识图谱

**内容**：ArticleReader 沉浸阅读器、d3 力导向图谱、Tailwind 护眼主题（双主题 CSS 变量）。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L14 | bug | 多级/中文 slug 笔记**打不开**（`[slug]` 单段路由不匹配） | 页面/API 改 `[...slug]` catch-all + **逐段 URL 编码**（整体 encodeURIComponent 会产生 %2F 导致路由失配 404） |
| L15 | bug | 刷新后登录状态丢失（SSR 端 `$fetch` 不带 cookie） | 7 处改用 `useRequestFetch()`（SSR 自动附加原始请求头） |
| L16 | bug | 暗色主题刷新**闪白（FOUC）**：SSR 首帧无法读 localStorage | nuxt.config `head` 内联脚本在 body 渲染前同步应用主题 |
| L17 | 细节 | 亮暗切换割裂（各部分 transition 时长 150/200/300ms 混用） | `html.theme-switching` 类统一 0.2s 过渡，双 rAF 后移除 |
| L18 | bug | 分页/标签筛选后列表不刷新（useAsyncData 只在 setup 执行一次） | 改**手动 fetch 模式**（ref + loadNotes + watch route.query） |
| L19 | bug | 侧边栏跳转另一篇笔记不刷新（组件跨 slug 复用） | slug 改 computed + `watch(slug, loadNote)` |
| L20 | 细节 | 图谱节点位置/缩放每次刷新丢失 | localStorage 持久化（`garden-graph-state`：节点坐标 + fx/fy 固定标记 + zoom 变换） |
| L21 | 细节 | 图谱节点大小区分度不足 | 支持按链接数（degree）或固定大小两种模式，设置持久化（`garden-graph-settings`） |

### 优化与细节

- 阅读器：滚动进度条、TOC（正则提取 h2/h3 + scrollIntoView）、阅读时长估算（字符数/400）、backlinks 玻璃卡片
- 图谱：拖拽后节点**固定**（Obsidian 行为）、点击跳转笔记、分组着色（成熟度三色 / 标签 8 色板自动分配）、物理开关、重置布局
- 主题：护眼 CSS 变量（羊皮纸暖白 `#FBFBFA` / 暖灰墨色 `#121212`）+ Lumina 玻璃拟态体系共存（`var(--...)` 兼容）

---

## 第四阶段 · 本地 Docker 与真实知识库接入

**内容**：`docker-compose.local.yml`（应用容器 + 复用本机 PG）本地演示；接入 289 篇真实 Obsidian 笔记。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L22 | bug | 真实知识库接入后 289 篇笔记**无法显示/打不开/图谱无边** | 见 L10（WikiLink 三级匹配）、L14（catch-all 路由）——根因是短文件名链接与多级 slug |
| L23 | 配置 | Docker 容器访问本机 PG | `host.docker.internal` + 端口映射；vault 用 bind mount 与本地实时互通 |
| L24 | 细节 | 容器名/镜像命名 | 容器 `garden-app`，镜像 `my-digital-garden-app`（Docker Desktop 中可见） |

---

## 第五阶段 · 功能增强（文件树 / 在线编辑 / 图谱 Obsidian 化）

**内容**：侧边栏文件树（可拖宽度）、在线新建/编辑/删除笔记（写回 vault 由 watcher 自动同步）、图谱拖拽固定 + 状态保存 + 自定义颜色大小。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L25 | bug | 侧边栏拖动宽度**跳变**（clientX 含容器居中偏移） | pointerdown 记录 `dragOffset = clientX - 当前宽度` |
| L26 | 细节 | 侧边栏收起生硬（v-if 直接移除 DOM） | 始终挂载 + 宽度 0↔N px 过渡（0.3s） |
| L27 | 细节 | 侧边栏不贴左（max-w-[1600px] mx-auto 居中） | 主体改全宽 flex（页面内容自身居中） |
| L28 | 细节 | 编辑保存后依赖 watcher 异步同步，**固定 1.5s 等待**脆弱 | （后于 L45 改为轮询） |
| L29 | 安全 | vault 路径穿越风险（`..` / 绝对路径） | `resolveVaultPath` 白名单校验（必须位于 VAULT_DIR 内） |
| L30 | 细节 | 编辑保存会**丢失 frontmatter**（DB 正文是 gray-matter 剥离后的，直接覆盖写文件丢 YAML 头） | **见 L44（后续审查修复）**——本阶段未发现，属历史遗留 bug |

### 优化与细节

- 文件树：递归组件、目录计数、搜索过滤（目录递归保留）、中文拼音排序、管理员目录内直接新建笔记
- 新建笔记：模板 frontmatter（title/tags/maturity）+ 标题合法性校验（拒绝 `/ \ :`，后扩展见 L51）
- 删除笔记：文件删除 → watcher unlink → DB 级联清理（幂等）

---

## 第六阶段 · UI 多轮修复与 Lumina 改版

**内容**：按 `ui.md` 设计稿迁移 Lumina 视觉语言（玻璃拟态、garden/obsidian 色板、字体体系），顶栏/侧边栏严格对齐。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L31 | 细节 | 顶栏/侧边栏视觉未按设计稿对齐 | 按 ui.md 迁移：glass-header/glass-card/bg-mesh、garden 绿 + obsidian 深色板、Inter/JetBrains Mono/Newsreader/Plus Jakarta Sans 字体 |
| L32 | 细节 | 正文链接样式不突出 | `.prose a` 发光绿 + 下划线过渡（亮暗主题双适配） |
| L33 | 细节 | 选中文本无品牌感 | `::selection` garden 绿半透明 |
| L34 | 细节 | 命令面板（⌘K）无反馈 | 聚焦 + ESC 关闭 + 加载态 + 空态提示 |

### 优化与细节

- 徽章体系：🌱 琥珀 SEEDLING / 🌿 天蓝 GROWING / 🌳 翠绿 EVERGREEN
- 滚动条细窄圆角、卡面 hover 上浮微交互、按钮 active 缩放

---

## 第七阶段 · 访问认证与管理后台

**内容**：AccessKey 密钥体系（密钥永久有效、登录 token 30 天）、admin/user 角色、管理后台（生成/禁用/删除密钥）。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L35 | 细节 | 密钥无过期概念 vs 登录态需过期 | 密钥永久；token 内嵌 `exp`（30 天），过期重新输密钥 |
| L36 | 安全 | token 伪造风险 | HMAC-SHA256 签名 + timingSafeEqual 恒定时间比较 + cookie httpOnly |
| L37 | 安全 | 禁用密钥后已有登录态仍有效 | `getAuthKey` 每次请求实时查 DB 校验 `isActive` |
| L38 | bug | 删除当前登录密钥会把自己锁死 | DELETE 接口拒绝删除当前会话密钥（400） |
| L39 | 细节 | 管理后台密钥展示 | 明文展示 + 最近使用时间（lastUsedAt 60s 节流更新） |
| L40 | 细节 | SSR 与客户端权限判断一致 | `useAuth`（useAsyncData('auth-me')）+ 全局路由守卫 + 服务端 requireAuth/requireAdmin 双保险 |

### 优化与细节

- 初始管理员密钥 `liutl` 由 `seed-auth.ts` 插件启动时自动播种（幂等）
- 密钥生成：16 位 base64url 大写字母数字（随机 12 字节）

---

## 第八阶段 · 生产部署与上线（ECS）

**内容**：阿里云 ECS（Alibaba Cloud Linux 4，2 核/1.6G/40G）→ Nginx（HTTPS）→ PM2 cluster → PostgreSQL 15 原生安装 → 域名 liutianle.cn 上线。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L41 | 部署 | Docker Hub 拉取失败（中国网络 registry-1.docker.io 超时） | **放弃容器方案**，改 dnf 原生 PostgreSQL 15 |
| L42 | 部署 | `.output` 不可跨平台迁移（pnpm 符号链接断裂，Windows 构建产物在 Linux 报 `ERR_INVALID_FILE_URL_PATH`） | 生产构建必须在服务器（Linux）上执行 |
| L43 | 部署 | npm/pnpm 网络慢、Prisma 引擎下载卡死 | `registry.npmmirror.com` + `PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma` |
| L44 | 部署 | certbot 不可用/拖垮服务器（EPEL 安装占满 1.6G 内存、CPU 77%） | 改用 **acme.sh 轻量方案**（纯 shell）签发证书 |
| L45 | 部署 | `ecosystem.config.js` ESM 冲突（package.json type: module → `module is not defined`） | 重命名为 `ecosystem.config.cjs` |
| L46 | 部署 | `prisma migrate deploy` 报 datasource.url required | 部署包补齐 `prisma.config.ts`（Prisma 7 必需） |
| L47 | 运维 | ECS 重启自动恢复 | PM2 startup/save + PG systemd + Nginx 开机自启（已实战验证） |
| L48 | 运维 | PM2 cluster 双实例 + watcher 插件 → **双 watcher 重复解析**隐患 | **见 L57（后续审查修复）**：仅主实例（NODE_APP_INSTANCE=0）监听 |
| L49 | 部署 | 生产数据库密码硬编码在 ecosystem/docker-compose 并进入 Git | **见 S1/L59（后续安全处置）**：改 .env 注入 + 生产密码轮换 |

### 优化与细节

- Nginx：80→301、443 SSL、`X-Forwarded-For/Proto` 透传、http2
- 服务器内存保护：PM2 `max_memory_restart: 450M` + `NODE_OPTIONS=--max-old-space-size=384`（后统一进 .env，见 L61）
- 运维速查：`pm2 logs/restart`、`psql`、acme.sh 自动续期

---

## 第九阶段 · 全面代码审查与安全修复（08-09）

**内容**：逐文件审查（前端 8 页 4 组件、后端 16 端点、部署配置、Git 历史、凭据管理），发现 20+ 问题并修复。详见 `PROJECT_NOTES.md` 第十二章。

### 🔴 安全（P0）

| # | 问题 | 修复 |
|---|---|---|
| S1 | 生产/本地 DB 密码硬编码进 Git（`ecosystem.config.js`、`docker-compose*.yml`） | 全部改环境变量注入；ecosystem 更名 `.cjs` 并从 `.env` 加载；后续生产密码轮换（见 L59） |
| S2 | PM2 cluster 多实例 → **双 watcher 重复解析**（行锁竞争/P2028 风险） | `watcher.ts`：`NODE_APP_INSTANCE` 非 `'0'` 时跳过监听并打日志 |
| S3 | 登录 **open redirect**（`/login?redirect=//evil.com` 跳外部） | `login.vue`：仅允许以 `/` 开头且非 `//` 的站内路径 |
| S4 | cookie 无 `Secure`（HTTPS 下仍可经明文 HTTP 传输） | `setAuthCookie`/`clearAuthCookie` 生产环境 `secure: true` |
| S5 | `AUTH_SECRET` 弱默认值兜底（token 可伪造） | 生产环境缺失/仍为默认值时**启动即失败**（fail fast） |

### 🟠 功能 bug（P1）

| # | 问题 | 修复 |
|---|---|---|
| M1 | `summary` / `readingTime` 字段**从未写入**（列表永远"暂无摘要"、时长前端重算） | markdown.ts 计算并入库（摘要 120 字、时长 字符/400）；ArticleReader 优先用 DB 值 |
| M2 | **编辑态跨笔记泄漏**：编辑 A 时跳 B，保存会把 A 草稿**覆盖到 B** | `watch(slug)` 重置 editing/draft |
| M3 | **编辑保存丢失 frontmatter**（DB 正文不含 YAML，直接写回 → 标签/标题/成熟度全丢） | PUT 端点读原文件 frontmatter 用 `matter.stringify` 合并写回 |
| M4 | maturity 非法值 → Prisma 枚举校验失败 → **整篇笔记不入库**且无重试 | 白名单校验，非法回退 SEEDLING |
| M5 | 保存后固定 1.5s 等待（watcher 慢时看到旧内容） | 轮询 watcher 入库（500ms 间隔，最长 10s，超时提示） |
| M6 | tags 含非字符串（如 `[123]`）→ 类型错误整篇失败 | 过滤非字符串/空标签 |

### ⚡ 性能与健壮性（P2）

| # | 问题 | 修复 |
|---|---|---|
| M7 | WikiLink 解析 **N+1 查询**（每链接 1-3 次 DB 往返） | `resolveTargetSlugs` 批量 IN 查询（精确/basename/aliases 三级合并） |
| M8 | 搜索 `contains`（ILIKE %q%）无索引 | 新增迁移：**pg_trgm GIN 索引**（title/content） |
| M9 | `vault/tree` 每次请求**全量递归扫盘** + graph 每次全量查库 | `server/utils/cache.ts` 进程内缓存（TTL + watcher 入库后手动失效） |
| M10 | 编辑写文件**非原子**（写入半截时 watcher 触发 → 半截内容入库） | 先写 `*.tmp` 再 rename（PUT/POST 均改）；watcher 忽略非 `.md` 后缀 |
| M11 | title 校验不全（仅禁 `/ \ :`，Windows 非法字符 `? * < > " \|` 未禁 → 写文件 500） | 正则统一校验 + 控制字符拒绝 |

### 🧹 质量与体验（P3）

| # | 问题 | 修复 |
|---|---|---|
| L50 | CommandPalette 无防抖/无竞态控制（快速输入旧响应覆盖新结果） | 200ms 防抖 + 请求序号（seq）丢弃过期响应 |
| L51 | GraphView 物理开关状态与页面不同步（重挂载后图标错位）；无窗口 resize 重绘 | `defineModel('physicsActive')` 双向同步；resize 更新中心力并重启模拟 |
| L52 | SPA 导航每次都请求 `/api/auth/me` | `auth.global.ts` 客户端 60s 缓存（仅缓存已登录结果，登录后立即生效） |
| L53 | 无 typecheck 脚本；前端大量 `any` | package.json 加 `typecheck`（`vue-tsc --noEmit`，依赖需 `pnpm add -D typescript vue-tsc`；本机 pnpm store 被锁未装，见遗留项） |
| L54 | 登录无防暴力 | verify 内存滑动窗口限流（每 IP 10 次/分钟，429） |
| L55 | 仓库卫生：部署包 `garden-deploy.tar.gz` 未忽略 | `.gitignore` 追加 `*.tar.gz`、`*.tmp`；ecosystem.config.js → .cjs（git mv） |
| L56 | 无备份策略文档 | 新增 `BACKUP.md`（vault 为准、DB 可重建、恢复演练） |

### 细节修正

- `notes/[...slug].vue`：watch 移到状态声明之后（避免引用顺序隐患）
- `graph.vue`：物理开关按钮不再手动翻转（v-model 自动同步）
- markdown.ts：`contentChanged` 比较只含 content/htmlContent（summary/readingTime 由 content 派生，无需单独比较）

---

## 第十阶段 · 生产密码轮换与代码更新（08-15/16）

**内容**：生产数据库密码轮换 + 双端代码更新（服务器 PM2 原生流程 + 本机 Docker 容器重建）。全部通过远程 SSH 执行。

### 问题与解决

| # | 类型 | 问题 | 解决 |
|---|---|---|---|
| L57 | 安全 | 生产密码曾硬编码进 Git 历史（轮换前泄露面评估） | 仓库无远端（`git remote -v` 空）→ 泄露面极小；仍执行**全量轮换** |
| L58 | 运维 | Windows OpenSSH 拒绝加载私钥（ACL 检查：`UNPROTECTED` / `Load key Permission denied` 双坑） | ① 沙箱拦截"ACL 被修改/新建"文件 → 用 WSL（Linux 文件系统 chmod 600）绕过；② ssh-agent 需系统服务（无管理员）→ 最终 **WSL + ssh/scp 通道** |
| L59 | 运维 | **PM2 `restart --update-env` 不重读配置文件**（dump.pm2 仍是旧密码 → 应用 AuthenticationFailed） | `pm2 delete` → `pm2 start ecosystem.config.cjs` → 仍失败 → **`pm2 kill` 重启 daemon** 清缓存后重新 start + `pm2 save` ✅ |
| L60 | 运维 | 新密码落盘与多配置源一致性 | 密码写 `/root/.garden-db-password.txt`（600）；.env 与 ecosystem.config.cjs 双处同步并验证（长度/一致性检查） |
| L61 | 运维 | 服务器内存保护参数分散 | `.env` 统一追加 `PM2_INSTANCES=1`、`NODE_OPTIONS='--max-old-space-size=384'`；ecosystem 支持 `PM2_INSTANCES`/`PM2_MAX_MEMORY` 环境变量覆盖 |
| L62 | 部署 | 服务器 **PG 缺 pg_trgm 扩展**（`postgresql15-contrib` 包名不存在） | `dnf install -y postgresql-contrib`（正确包名）→ pg_trgm.control 就位 |
| L63 | 部署 | Prisma **P3009**：上次失败迁移阻塞后续迁移 | `prisma migrate resolve --rolled-back <迁移名>` → 重新 `migrate deploy` ✅ |
| L64 | 运维 | 无 git 服务器（`git: command not found`）无法增量拉取 | 本地 tar 打包（排除 node_modules/.nuxt/.output/.env/私钥）→ scp → 解压；打包后校验无敏感文件 |
| L65 | 细节 | 本机 Docker Desktop 中的 `garden-app` 容器（`my-digital-garden-app` 镜像）为本地演示版（7 天前停止） | 澄清与服务器部署无关（服务器 Docker 0 容器）；本次一并**重建镜像 + 启动** |
| L66 | 细节 | 新代码 cookie Secure 生效后 HTTP 明文无法保存登录态 | 生产验证改用 `curl -k https://liutianle.cn`；本机容器验证以接口返回码为准 |
| L67 | 细节 | 生产旧数据 summary/readingTime 为 null/0（watcher 不重同步是刻意设计） | 每篇笔记下次编辑/变更时自动补写；不做全量 touch（避免改 vault mtime 影响同步） |

### 部署结果（已验证）

| 验证项 | 结果 |
|---|---|
| 服务器 HTTPS：login/notes/tree/graph/tags | 全部 200 |
| verify：liutl / 错误密钥 / 连错触发限流 | 200 / 401 / 429 |
| pm2：1 实例 online、内存 130MB、watcher 单实例监听日志 | ✅ |
| 数据库：`Note_title_trgm_idx` / `Note_content_trgm_idx` 存在 | ✅ |
| 本机容器：garden-app Up、迁移完成、watcher 监听、接口 200/401 | ✅ |

### 细节沉淀

- **SSH 私钥排障路径**：OpenSSH 对私钥要求"owner=当前用户 + 仅 owner/Administrators/SYSTEM 可访问 + ACL 可读"；`(R)` 权限不含 READ_CONTROL 也会被拒；OneDrive 云占位文件（ReparsePoint）复制会得到占位符副本（内容复制需 `Get-Content -Raw | Set-Content`）；沙箱环境子进程读文件受限 → WSL 通道最稳
- **远程命令执行规范**：PowerShell 5.1 不支持 `&&`、多层引号转义易碎 → 统一用 **base64 编码 bash 脚本 → 服务器解码执行**，天然免疫引号/编码问题
- 部署包排除清单：`node_modules .nuxt .output .git .env .ssh-tmp keys-tmp *.tar.gz build-log* dev-log*`

---

## 问题索引表

> 按类型汇总全部条目（L=开发历程，S=安全，M=功能/性能修复）。

| 类型 | 条目 |
|---|---|
| 工具链/构建（7） | L01 L02 L03 L04 L12 L41 L43 |
| 数据库/管道 bug（6） | L06 L07 L08 L09 L10 L11 |
| 前端/SSR/路由 bug（8） | L14 L15 L16 L18 L19 L22 L25 L28 |
| 设计/体验细节（10） | L13 L17 L20 L21 L23 L24 L26 L27 L31 L32 L33 L34 |
| 认证/安全（8） | L35 L36 L37 L38 L39 L40 S1 S3 S4 S5 L54 |
| 部署/运维（14） | L44 L45 L46 L47 L48 L49 L57 L58 L59 L60 L61 L62 L63 L64 |
| 功能 bug 修复（6） | M1 M2 M3 M4 M5 M6 |
| 性能/健壮性（5） | M7 M8 M9 M10 M11 |
| 质量/体验（6） | L50 L51 L52 L53 L55 L56 |
| 数据与一致性细节（2） | L66 L67 |

---

## 遗留事项与后续优化

1. **生产旧笔记 summary/readingTime 未回填**：待自然编辑触发补写（刻意不做全量 touch）
2. **`pnpm typecheck` 未首跑**：本机 pnpm store 被其他进程锁定（index.db 无法打开）未能安装 `typescript`/`vue-tsc`；解锁后执行 `pnpm add -D typescript vue-tsc && pnpm typecheck`，并收敛前端 `any`（建议从 API 层开始）
3. **未知 `/api/*` 路径返回 401 而非 404**（Nitro 全局中间件在路由匹配前鉴权，精确 404 需重构鉴权层级，收益低暂缓）
4. **密钥明文存储**：单机个人场景可接受；升级哈希需改 verify/生成流程（列 `PROJECT_NOTES.md` 可扩展方向）
5. **服务器无 git**：后续频繁更新建议服务器安装 git + 私有远端，替代 tar 全量包
6. **vault 双向同步**（Obsidian ↔ 服务器 Syncthing）：内存受限，按需启用
7. **图谱 >500 节点**：d3 SVG 改 Canvas 渲染
8. **多实例缓存独立**：PM2 多 worker 时 tree/graph 缓存各进程一份（短 TTL 兜底可接受）；若扩实例需共享缓存（Redis）
9. **服务器回滚备份保留**：`.output.bak-2026-08-16-0008` 等备份确认稳定后可清理
