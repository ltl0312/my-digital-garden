# 「拾光」数字花园 · 项目总结

> 生成日期：2026-08-08 ｜ 状态：**已上线生产** ｜ 访问：https://liutianle.cn（密钥经部署配置注入，源码不存储）

---

## 一、项目概述

基于 **Nuxt 4 全栈架构**的个人知识管理系统（数字花园）：本地 Obsidian 笔记通过 watcher 自动同步入库，Web 端提供沉浸式阅读、知识图谱、在线编辑与权限管理。按 `PROJECT_PLAN.md` 六个阶段 + 多轮增强迭代完成。

**技术栈**：Nuxt 4.5.1 / Vue 3.5 / Tailwind v3（Lumina 玻璃拟态 UI）/ Prisma 7 / PostgreSQL 15 / d3 力导向图 / Chokidar / unified-remark-rehype 解析链 / lucide-vue-next

---

## 二、用户需求演进（按时间线）

| 阶段 | 需求 | 状态 |
|---|---|---|
| Phase 1-6 | 按计划书完成脚手架/建模/watcher/阅读器/API/图谱/部署配置 | ✅ |
| 本地 Docker | 部署到本地 Docker 看效果 | ✅（应用容器 + 本机 PG） |
| 真实知识库接入 | 289 篇笔记无法显示/打不开/图谱无边 | ✅ 修复 |
| 改名 | 网站改名「拾光」 | ✅ |
| 知识库增强 | 文件树侧边栏 + 在线创建/编辑/删除笔记 + 图谱 Obsidian 化（拖拽固定/状态保存/自定义颜色大小） | ✅ |
| UI 多轮修复 | 分层缩进/标签筛选/分页刷新/可拖侧边栏/跳转刷新/固定导航/主题同步/FOUC 等 10+ 项 | ✅ |
| Lumina 改版 | 按 ui.md 迁移视觉语言（顶栏/侧边栏严格对齐，保留架构与功能） | ✅ |
| 访问认证 | 密钥登录（30 天登录状态）、管理员权限分级、管理后台 | ✅ |
| ECS 部署 | 清理旧项目（easyweibo/MySQL/frp）→ 全新部署 → 域名 HTTPS | ✅ |

---

## 三、核心功能清单（生产可用）

- **数据管道**：Chokidar 监听 `content/vault` → YAML 解析（容错）→ WikiLink 三级解析（精确/basename/aliases）→ unified 编译 HTML（KaTeX/Shiki）→ Prisma 事务写入（串行队列）
- **阅读器**：滚动进度条、Garden Vault 面包屑、maturity 三色徽章（🌱琥珀/🌿天蓝/🌳翠绿）、阅读时长估算、TOC 点击定位、wiki-link 发光样式、backlinks 玻璃卡片
- **知识图谱**：d3 力导向（287 节点/278 边）、Lumina 三色、拖拽固定位置、缩放平移、**状态持久化**（localStorage）、分组着色（成熟度/标签）+ 自定义颜色、大小模式（按链接数/固定）、物理开关、重置布局
- **侧边栏**：可拖宽度（持久化）、搜索过滤、文件夹树（Folder 图标+计数）、标签云、Vault Synced 状态栏、贴左布局、丝滑收起
- **在线编辑**：新建/编辑/删除笔记（写回 vault，watcher 自动同步）、管理员专属
- **命令面板**：⌘K 全局搜索跳转
- **认证系统**：密钥登录（**密钥永久有效，登录状态 30 天**）、admin/user 权限分级（UI 按钮 + 服务端 403 双保险）、管理后台（生成/禁用/删除密钥，实时生效）、初始管理员
- **体验优化**：暗黑模式（FOUC 防护内联脚本 + theme-switching 统一 0.2s 过渡）、SSR 认证（useRequestFetch cookie 转发）、护眼/Lumina 双主题体系

---

## 四、生产部署架构

```
https://liutianle.cn
   └→ Nginx (80→301, 443 SSL, acme.sh ECC 证书自动续期)
        └→ PM2 cluster ×2 (Nuxt SSR :3000, 开机自启)
             ├→ PostgreSQL 15（127.0.0.1:5432 回环，garden_user）
             ├→ Chokidar watcher（生产轮询 1s）
             └→ content/vault（287 篇笔记）
```

**服务器**：阿里云 ECS 8.163.35.246（Alibaba Cloud Linux 4，2 核 / 1.6G 内存 / 40G）
**部署目录**：`/opt/digital-garden`（源码 + .env + ecosystem.config.cjs）
**可用性**：ECS 重启全自动恢复（PM2 + PG + Nginx 开机自启，已实战验证）

---

## 五、遇到的问题与解决方法（技术要点）

### 基础设施 / 工具链

| 问题 | 现象 | 解决方法 |
|---|---|---|
| pnpm 10+ 构建脚本拦截 | `ERR_PNPM_IGNORED_BUILDS` | `pnpm-workspace.yaml` 配 `allowBuilds: { esbuild/prisma: true }` |
| unified 版本错配 | 初装 9.2.2 与 remark-parse@11 冲突 | 显式 `pnpm add unified@^11` |
| corepack 缓存层隔离 | Docker 构建 runtime 层 pnpm 不可用 | 改用 `npm i -g pnpm@11.1.3` |
| Docker 构建期无 DATABASE_URL | `prisma generate` 报 env 缺失 | 构建阶段注入占位 DATABASE_URL |
| Windows 直跑 .output 崩溃 | `ERR_INVALID_FILE_URL_PATH`（Nitro `_entry.js` fallback） | Linux 服务器原生构建（.output 不可跨平台迁移，pnpm 符号链接断裂） |
| Docker Hub 拉取失败 | 中国网络连 registry-1.docker.io 超时 | 放弃容器方案，改 **dnf 原生 PostgreSQL 15** |
| npm/pnpm 网络慢 | 默认 registry 超时 | 全局 `npm config set registry https://registry.npmmirror.com` |
| Prisma 引擎下载卡死 | @prisma/engines postinstall 连 binaries.prisma.sh 超时 | `PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma` |
| certbot 不可用/拖垮服务器 | Alinux 无 certbot 包；EPEL 安装占满 1.6G 内存 CPU 77% | 改用 **acme.sh 轻量方案**（纯 shell）签发证书 |
| ecosystem.config.js ESM 冲突 | `module is not defined`（package.json type: module） | 重命名为 `ecosystem.config.cjs` |
| 部署包遗漏 prisma.config.ts | migrate deploy 报 datasource.url required | 补传 prisma.config.ts（Prisma 7 必需） |

### 数据管道 / 数据库（Prisma 7 适配）

| 问题 | 现象 | 解决方法 |
|---|---|---|
| 批量事务不可靠 | `$transaction([...])` 间歇 P2028 超时 | 列表 API 改独立查询（findMany + count 分开） |
| 并发连接池爆满 | 287 篇并发处理触发 P2028 | watcher 改**串行队列** + 事务 maxWait/timeout 放宽 |
| NUL 字节写入失败 | PG 错误码 22021（0x00） | 读取文件后剥离 NUL + metadata 递归清理 |
| NoteLink 唯一约束冲突 | 同篇重复链接撞复合主键 | 建边前 `new Set(outgoingTargets)` 去重 |
| WikiLink 匹配失败 | 图谱 0 边（target 是短文件名） | `resolveTargetSlug` 三级匹配：精确 → basename endsWith → metadata.aliases array_contains |
| YAML 解析失败整篇丢失 | js-yaml 报错中断 | gray-matter 容错降级（正文仍入库）+ try-catch 保事件链 |
| Prisma 7 generator 语法 | prisma-client-js 已移除 | `prisma-client` + `output` + @prisma/adapter-pg + prisma.config.ts |

### 前端 / 路由 / SSR

| 问题 | 现象 | 解决方法 |
|---|---|---|
| 多级/中文 slug 打不开 | `[slug]` 单段路由不匹配 | 页面/API 改 `[...slug]` catch-all + **逐段 URL 编码**（整体 encodeURIComponent 会生成 %2F 失配） |
| 刷新后登录丢失 | SSR 端 $fetch 不带 cookie | 7 处改用 `useRequestFetch()`（SSR 附加请求头） |
| 暗色刷新闪白（FOUC） | SSR 首帧无法读 localStorage | nuxt.config head **内联脚本**在 body 渲染前应用主题 |
| 亮暗切换割裂 | duration 150/200/300 混用 | `theme-switching` 类统一 0.2s 过渡（双 rAF 移除） |
| 分页/标签不刷新 | useAsyncData 只在 setup 执行一次 | 改**手动 fetch 模式**（ref + loadNotes + watch route.query） |
| 笔记跳转不刷新 | 组件跨 slug 复用 | slug 改 computed + `watch(slug, loadNote)` |
| 侧边栏拖动跳变 | clientX 含容器居中偏移 | pointerdown 记录 `dragOffset = clientX - 当前宽度` |
| 侧边栏收起生硬 | v-if 直接移除 DOM | 始终挂载 + 宽度 0↔N px 过渡（0.3s） |
| 侧边栏不贴左 | max-w-[1600px] mx-auto 居中 | 主体改全宽 flex（页面内容自身居中） |

### 部署过程 / 操作环境

| 问题 | 现象 | 解决方法 |
|---|---|---|
| Git Bash 历史展开 | `!@localhost: event not found`（密码含 !） | 执行前 `set +H` |
| pkill 自杀 | `pkill -f 'pnpm install'` 杀掉当前 SSH 会话 | 避免 pkill 模糊匹配；直接重装 |
| OpenSSH 拒绝密钥 | OneDrive .pem "bad permissions" | 复制到 `C:\Users\ZhuanZ\.ssh\garden.pem` + `icacls` 收紧 |
| 粘贴丢空格 | `cat.env`、`config.js/config.cjs` 连字 | 命令拆短单行；改用 CMD（Ctrl+V 不丢字符） |
| 权限分类器拦截 SSH | auto mode 对生产服务器写操作误判 | 部署命令写入 `E:\OneDrive\Desktop\指令.txt` 由用户执行；只读验证由我执行 |
| dnf 拖垮服务器 | certbot 安装 CPU 77%、SSH 卡死 | 控制台重启实例（自动恢复）+ 换 acme.sh |

---

## 六、运维速查

```bash
# 应用
pm2 status                      # 2 实例 online
pm2 logs digital-garden         # 日志（watcher 入库/错误）
pm2 restart digital-garden      # 重启应用

# 数据库
sudo -u postgres psql           # 本机管理
PGPASSWORD='GardenProd2026!' psql -h 127.0.0.1 -U garden_user -d garden_db

# Nginx / HTTPS
systemctl reload nginx
~/.acme.sh/acme.sh --renew -d liutianle.cn    # 证书续期（自动）

# 更新部署
cd /opt/digital-garden && pnpm install && npx prisma migrate deploy && pnpm build && pm2 restart digital-garden
```

---

## 七、后续可选优化

1. **vault 双向同步**：Obsidian 本地 ↔ 服务器 Syncthing（内存紧张，建议按需）
2. **www 子域名**：DNS 添加后补证书与配置
3. **内存监控**：1.6G 较紧张，建议阿里云监控告警（当前 ~1.2G）
4. **密钥哈希存储**：当前明文存 DB（个人单机可接受，生产可升级）
5. **图谱节点数大时的性能**：>500 节点可考虑 Canvas 渲染（当前 d3 SVG 287 节点流畅）
