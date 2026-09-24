# ✨ 拾光 · Digital Garden

**Non-linear Knowledge Sanctuary** — 基于 Nuxt 4 全栈架构的个人知识管理系统（数字花园）。

本地 Obsidian 笔记通过文件监听自动同步入库，Web 端提供沉浸式阅读、双向链接知识图谱、在线编辑与访问密钥权限管理。

> 生产地址：https://liutianle.cn ｜ 项目文档索引见文末「文档导航」

---

## ✨ 功能特性

- **📥 自动同步管道**：Chokidar 实时监听 `content/vault`，新增/修改/删除 Markdown 自动解析入库（生产环境轮询模式，适配云盘挂载）
- **🧠 Obsidian 原生语法支持**：`[[WikiLink]]` 双向链接（精确 slug / 文件名 / aliases 三级解析）、YAML Frontmatter（容错降级）、GFM、LaTeX 数学公式（KaTeX）、代码高亮（Shiki / nord 主题）
- **📖 沉浸式阅读器**：滚动阅读进度条、目录 TOC 点击定位、成熟度徽章（🌱 幼苗 / 🌿 成长 / 🌳 常青）、阅读时长估算、反向链接卡片
- **🕸️ 知识图谱**：d3 力导向图，拖拽固定节点（Obsidian 行为）、缩放平移、布局与设置持久化（localStorage）、按成熟度/标签着色、节点大小按链接数
- **🗂️ 侧边栏**：可拖拽宽度（持久化）、文件树过滤、标签云、新建笔记、Vault 同步状态指示
- **⌘K 命令面板**：全局搜索笔记快速跳转
- **✏️ 在线编辑**：管理员可在 Web 端新建 / 编辑 / 删除笔记（写回 vault，watcher 自动同步）
- **🔐 访问认证**：密钥登录（密钥永久有效、登录状态 30 天）、admin/user 权限分级、管理后台（生成 / 禁用 / 删除密钥，实时生效）
- **🌗 双主题**：暗黑模式（SSR FOUC 防护）、Lumina 玻璃拟态设计语言、护眼色彩体系

---

## 🛠️ 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Nuxt 4（SSR 全栈）、Vue 3、Vue Router |
| 样式 | Tailwind CSS v3、@tailwindcss/typography、Lumina 设计语言（见 `ui.md`） |
| 数据库 | PostgreSQL 15+、Prisma 7（`prisma-client` + `@prisma/adapter-pg`） |
| Markdown 管道 | unified 11、remark-parse / remark-gfm / remark-math / remark-rehype、rehype-katex / rehype-shiki / rehype-stringify、gray-matter |
| 文件监听 | chokidar |
| 图谱 | d3 v7（力导向 SVG） |
| 认证 | 自研 HMAC-SHA256 token + httpOnly Cookie |
| 部署 | Nginx + PM2（cluster）× PostgreSQL（详见 `DEPLOY.md`） |

---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20.19、pnpm ≥ 8（或 npm / yarn / bun）
- PostgreSQL 15+（本地或远端均可）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

创建 `.env`（Prisma 7 通过 `prisma.config.ts` 使用 Node 原生 `loadEnvFile` 加载）：

```bash
DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/digital_garden?schema=public"
AUTH_SECRET="改为一段随机长字符串"   # 可选，默认 dev-secret-change-me
PORT=3000                            # 可选
```

### 3. 初始化数据库

```bash
npx prisma migrate dev --name init   # 建表并生成客户端
```

> Prisma 客户端会生成到 `prisma/generated/client`（见 `schema.prisma` 的 `output` 配置）。

### 4. 准备 vault 笔记目录

向 `content/vault/` 放置 Markdown 笔记（可整体放入 Obsidian 库，结构不限）：

```bash
mkdir -p content/vault
echo -e "---\ntitle: Hello Garden\ntags: [Nuxt, Garden]\nmaturity: SEEDLING\n---\n# 你好，花园\n\n支持 [[双向链接]] 语法。" > content/vault/hello-garden.md
```

### 5. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000 ，使用访问密钥登录。初始管理员密钥**只从环境变量 `SEED_ADMIN_KEY` 注入**（源码不含默认值）：仅在密钥表为空的首次启动播种一次，存量部署无需配置；空库且未配置时应用拒绝启动（见 `server/plugins/seed-auth.ts`）。

---

## 📁 项目结构

```
my-digital-garden/
├── app/                      # 前端（Nuxt 4 app 目录）
│   ├── components/           # ArticleReader / GraphView / FileTree / CommandPalette
│   ├── composables/          # useAuth / useTheme
│   ├── layouts/              # default（主布局）/ auth（登录页）
│   ├── middleware/           # auth.global.ts 全局路由守卫
│   └── pages/                # index / notes / graph / login / admin
├── server/                   # Nitro 后端
│   ├── api/                  # notes / tags / auth / admin/keys / vault 接口
│   ├── middleware/auth.ts    # API 级鉴权守卫
│   ├── plugins/              # watcher（文件监听）/ seed-auth（初始密钥）
│   └── utils/                # db / markdown / vault / auth
├── prisma/
│   ├── schema.prisma         # Note / Tag / NoteTag / NoteLink / AccessKey
│   └── migrations/
├── content/vault/            # 笔记库（Obsidian vault，被 watcher 监听）
├── public/                   # 静态资源
├── nuxt.config.ts            # Nuxt 配置（主题 FOUC 防护、字体、CSS）
├── tailwind.config.js        # garden / obsidian 色板
├── prisma.config.ts          # Prisma 7 CLI 配置
└── ecosystem.config.cjs      # PM2 生产进程配置
```

详细说明见 [`PROJECT_NOTES.md`](./PROJECT_NOTES.md)。

---

## 🔌 数据流概览

```
Obsidian 本地写作
   │  同步 / 放置
   ▼
content/vault/**/*.md
   │  Chokidar 监听（add / change / unlink）
   ▼
server/plugins/watcher.ts  ── 串行队列（防连接池超时）
   ▼
server/utils/markdown.ts
   │  gray-matter 解析 → WikiLink 三级解析 → unified 渲染 HTML
   ▼
PostgreSQL（Note / Tag / NoteTag / NoteLink）
   │  Nitro REST API
   ▼
Vue 3 SSR 渲染（阅读 / 图谱 / 编辑）
```

---

## 🔐 认证与权限

- 访问密钥（`AccessKey`）**永久有效**；登录后签发 30 天有效的 httpOnly Cookie（`garden_token`）
- 角色：`admin`（可编辑笔记、管理密钥）/ `user`（只读浏览）
- 服务端所有 `/api/*` 均需有效 token（白名单：`/api/auth/verify`、`/api/auth/me`、`/api/auth/logout`），管理员接口另有 `requireAdmin` 二次校验
- 管理后台：`/admin`（仅 admin 可见）

详见 [`API.md`](./API.md) 与 [`PROJECT_NOTES.md`](./PROJECT_NOTES.md)「认证体系要点」。

---

## 📦 构建与部署

```bash
# 开发
pnpm dev

# 生产构建（.output）
pnpm build

# 启动生产产物（经 scripts/start-prod.mjs，Windows 本机验证亦可用）
pnpm start

# 预演
pnpm preview
```

> ⚠️ **重要**：`.output` 依赖 pnpm 符号链接结构，**不可从 Windows 构建后拷贝到 Linux 运行**，生产构建必须在服务器（Linux）上执行。

生产部署（Nginx + PM2 + PostgreSQL + HTTPS）完整步骤见 [`DEPLOY.md`](./DEPLOY.md)；线上实际架构与运维速查见 [`PROJECT-SUMMARY.md`](./PROJECT-SUMMARY.md)。

---

## 📚 文档导航

| 文档 | 内容 |
|---|---|
| [`PROJECT_NOTES.md`](./PROJECT_NOTES.md) | 项目认知记录：源码级架构、数据流、API 清单、踩坑决策、审查修复记录（AI 协作速查） |
| [`PROJECT_LOG.md`](./PROJECT_LOG.md) | **项目进程日志**：按时间线记录全部问题/bug/代码问题/优化细节（含历史） |
| [`API.md`](./API.md) | 完整 REST API 参考（参数 / 响应 / 错误码 / 示例） |
| [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) | 原始实施计划书（架构选型、六阶段路线图） |
| [`PROJECT-SUMMARY.md`](./PROJECT-SUMMARY.md) | 项目总结：需求演进、生产架构、踩坑记录、运维速查 |
| [`DEPLOY.md`](./DEPLOY.md) | 本地到云服务器一键部署手册 |
| [`BACKUP.md`](./BACKUP.md) | 备份策略（vault 为准，DB 可重建） |
| [`SECURITY-ACTIONS.md`](./SECURITY-ACTIONS.md) | ⚠️ 待执行：生产数据库密码轮换操作清单（执行后可删除） |
| [`ui.md`](./ui.md) | Lumina 界面设计稿（HTML 原型） |
