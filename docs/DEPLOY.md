# 数字花园 · 生产部署手册（Docker）

> 目标环境：阿里云 ECS `8.163.35.246`（Alibaba Cloud Linux 4，2 核 / 1.6G 内存 / 40G）
> 技术栈：Nuxt 4（Nitro 生产产物）+ PostgreSQL（**宿主原生**）+ Docker + Nginx + acme.sh
> 线上域名：`https://liutianle.cn`
>
> 最后核实：2026-11-20 23:05 CST（v2.2.0 已上线，容器 `garden-app` 内存 98.88 MiB / 640 MiB，宿主磁盘 82%）。**线上由 Docker 容器承载，PM2 未在运行**（历史 PM2 路径见 §9）。

---

## 0. 线上实况速览

```
https://liutianle.cn
   └→ Nginx（80→301，443 SSL，acme.sh ECC 证书自动续期）
        └→ proxy_pass http://127.0.0.1:3000
             └→ Docker 容器 garden-app（my-digital-garden-app:latest，network_mode: host）
                  ├→ 宿主原生 PostgreSQL（127.0.0.1:5432，postgresql.service）
                  ├→ Chokidar watcher（容器内 /app/content/vault）
                  └→ bind mount /opt/digital-garden/content/vault（Obsidian 库）
```

| 项 | 值 |
|---|---|
| 编排目录 | `/opt/garden-docker`（`docker-compose.prod.yml` + `.env`，`.env` mode 600） |
| 备份目录 | `/opt/garden-backup`（compose / .env 按时间戳留档 + 回滚镜像 ID） |
| 容器名 | `garden-app`，`restart: unless-stopped`，`network_mode: host` |
| 资源上限 | `mem_limit: 640m` + `NODE_OPTIONS=--max-old-space-size=384` |
| 镜像 tag | `my-digital-garden-app:latest` 与 `:vX.Y.Z` 指向同一 ImageID |
| Docker | Engine 24.0.9（overlay2，classic image store） |
| 数据库 | 宿主原生 PostgreSQL，**非容器**；`/opt/garden-docker/.env` 的 `DATABASE_URL` 指向 `127.0.0.1:5432` |
| HTTPS | acme.sh（`/root/.acme.sh/liutianle.cn_ecc`），**非 certbot** |

> **镜像在开发机构建，服务器只 `docker load` 后直接跑**——服务器 1.6G 内存不足以跑 `pnpm install && pnpm build`。

### 线上版本与回滚链（服务器 classic store 的 ImageID）

| tag | ImageID | 内容 |
|---|---|---|
| `latest` / `v2.2.0` | `15b3aea45c6e` | **全链路体验升级（可达性 / 触控 / 状态闭环 / 信息架构）**：`--ink-3` 亮 `#7B838F`→`#616A77`（对四底色 5.47/4.97/5.20/4.76 全部达 AA）、暗 `#78829A`→`#828CA0`（surface-3 由 4.14 提到 4.71）；新增 `--line-strong`（亮 `#8E8778` 3.57/3.24、暗 `#5C6A7B` 5.52/5.01）接管控件描边；删 17 处 `focus:outline-none` + `:focus-visible` 去掉 `border-radius`（焦点环不再被工具类压掉、胶囊聚焦不再 9999→6px 跳变）；`TagPill` 无 `to` 时渲染 span 而非空 button（60 个死按钮归零）；胶囊/图标钮加 `.tap-y`/`.tap-44` 透明热区（390 宽下 under44 由 75 → 0）；列表骨架 `NoteListSkeleton.vue` + `EmptyState` 错误态与重试；首页「最近更新」上提到统计卡之后（top 1437→424）、`/browse` 提为一级导航（底栏 3→4）、正文 16→17px（仍 720px 列宽，42.4 字/行）；Tailwind 补 `pill`/`fab`/`xs` 圆角键与 `max-w-measure`，`z-index` 定为 command 1000 < sheet 1100 < dialog 1200 < popover 1300 < toast 1400；`ImportDialog` 58 处 legacy 调色板类归入设计令牌（**当前**） |
| `v2.1.2` | `bf9400a5d018`（运行时 `7f56115fa52b`） | **首屏文档 802,626 → 82,426 B（-89.7%）**：侧栏目录树（`/api/vault/tree` 449,862 B）与标签（`/api/tags` 204,228 B）改 `server: false` 客户端取数，首屏 payload 722,128 → 10,643 B；配合 nginx 的 `proxy_buffering` 兜底，根治「文档被 CDN 512 KiB 掐断 → 不水合 → 侧栏点不动、要刷新 1~3 次」；另修 `markdown-sanitize.ts` 5 处 `noUncheckedIndexedAccess` 类型错误（v2.2.0 的回滚点） |
| `v2.1.1` | `9236911f1af8` | **三个线上缺陷**：①侧栏宽度被 localStorage 脏值（`NaN`/`abc`/`1280`/`640`）撑宽且拖拽未做 pointer capture 导致 `resizing` 卡死、整页点不动——现在脏值一律丢弃回默认 320、拖拽四路收尾、补 `onBeforeUnmount`；②右键删除文件夹对非 root 管理员静默失效——菜单项不再用原生 `disabled`（浏览器不派发 click）改 `aria-disabled` + toast 说明，权限收紧为「有写权限即可、结构目录除外」，删除后同时刷新标签与统计；③侧栏「未分组」消失——新增 `shared/tag-group.ts` 按「人工映射 → 同篇共存证据 support≥2 → 目录派生领域 → 自身命名空间」推导 974 个历史裸标签的分组，标签真名不动 |
| `v2.1.0` | `ee065a95720d` | **移除知识图谱页**（D3 力导向图整页 + `/api/graph/*` 配色与规则接口 + 全部 `GraphView`/`components/graph`/`useGraph*`/`lib/graph-*`，`shared/graph-domain.ts`→`shared/domain.ts`）；首页改为**笔记总览仪表盘**（笔记总数/双向链接/孤立笔记/目录数 + 按目录、按类型、按成熟度三段卡片），新增 `/browse?kind=dir|type|maturity&value=…` 分类浏览页；新增 `GET /api/overview`（单次 findMany + 内存分桶，30s 进程内缓存），`/api/notes` 增 `type` / `maturity` 参数 |
| `v2.0.5` | `d024300f6fac` | 行内代码不再显示字面反引号：覆盖 @tailwindcss/typography 的 `code::before/::after{content:"`"}` 并改为胶囊底色；解析前清洗 `markdown-sanitize.ts`（表格单元格代码内的裸 `\|`、代码跨度内 `$` 防 remark-math 误吞）+ `RENDER_VERSION` 6 |
| `v2.0.4` | `0ef8aff138fa` | AI 审计：截断时自动放大重试并**抢救已写完的建议**、失败原因在界面上可见、扫描上限 60 → 200（详见下方 v2.0.4 说明）。实测同一范围 60 篇：失败 59 → 25 → **0** |
| `v2.0.3` | `38c799d7cb9d` | 审计失败第一步：截断自动放大重试（×1.8）+ failReasons 可见 + 上限 200。实测失败 59/60 → 25/60，但截断仍在发生，故随后有 v2.0.4 |
| `v2.0.2` | `6c37a5483402` | 审核通过不再覆盖笔记原有标签（数据损坏修复）+ 徽标/名单同源 + 零引用标签清理；并用备份回灌了被覆盖的标签（详见下方 v2.0.2 说明） |
| `v2.0.1` | `d097c1f11aaf` | 杜绝无命名空间标签（裸标签五级处理，新建命名空间需在审核面板逐条同意）+ 多选器重开后勾选归零（详见下方 v2.0.1 说明） |
| `v2.0.0` | `e1858be940c1` | 库备份与恢复 + AI 全库审计 + 「未分组」说明 + 弹窗残留修复；新增宿主 bind mount `/opt/digital-garden/data`（详见下方 v2.0.0 说明） |
| `v1.9.9` | `481d354475df` | 删除当前笔记后离开该页 + 新增错误页 + 新建路径统一；部署文件移入 `deploy/`（详见下方 v1.9.9 说明） |
| `v1.9.8` | `27384584acc5` | 题名归一为字符串 + watcher 启动/周期对账：修「新建数字标题的笔记后打不开、页面一片空白」 |
| `v1.9.7` | `6a6a5fe43ba2` | 新建/重命名/删除三处缺陷修复（详见下方 v1.9.7 说明） |
| `v1.9.6` | `6f20113277cf` | 补记：2026-10-05 上线，当时未在手册留记录（无 schema 变更） |
| `v1.9.5` | `1739fc106190` | 修右侧目录（TocRail）**不跟随正文滚动**：IntersectionObserver 正常，但目录列表自身从不滚动（活动项在 437px 视口下方 1668px）→ 改为按 `activeIdx` 调整 `ul.scrollTop`；新增只读回归套件 `acceptance:toc` |
| `v1.9.4` | `0e4da9da02fd` | 修「测试连接」假阳性：`/models` 返回 2xx 但**不校验响应体形状**时会把「地址指错」误报成「连接成功」（用户把 baseUrl 填成本站自身时正是如此）；改为要求 `data` 数组 / chat 响应含 `choices` |
| `v1.9.3` | `8f75f6f750c3` | **建议质量修复**（生产 200 条建议被用户全部驳回）：候选必须有正文/标题证据（同目录共用只加分、不再单独入选）、链接目标不再算内容（`[[MOC]]` 不推 `type/MOC`）、**中文末段标签必须同时命中命名空间**（`Java/安全` 不再因正文出现「安全」而命中） |
| `v1.9.2` | —（未记录服务器镜像 ID） | AI 开关**点击即保存**（此前翻开关不点保存、刷新即回原值）+ 状态文案区分未保存/缺密钥/缺模型；多选器确认后**先关弹窗再判定**（避免 60s 反代超时导致弹窗卡住并挡住审核面板）；结构树右键（目录与文件）与详情页「更多操作」增「标签 · 领域自动分配」 |
| `v1.9.1` | `79791c95c01c` | **笔记多选器**：可搜索/按领域与标签筛选/只看还没判定的/跨页多选，指定任意笔记做标签·领域判定；`/api/notes` 增 `hasPending`（仅管理员）与 `pending`/`domain` 筛选；修 `/admin` 模板编译错误与审核面板未按 `onlyIds` 收敛 |
| `v1.9.0` | `4e59e5013e23` | 标签 · 领域自动分配与人工审核（`Suggestion` 待审表 + `Note.domainLevel1` 显式领域）+ 「AI 增强设置」（`AppSetting`，API 密钥加密落库、界面可开关）；新增迁移 `20261020000000_tag_domain_suggestions` / `20261021000000_app_settings` |
| `v1.8.0` | `a75d6e46d80f` | 图谱：修复 Canvas 分级（>150 节点）下**连线完全不绘制**、邻域聚焦失灵；连线配色加深 |
| `v1.7.0` | `72f0b4acbd8a` | 图谱：颜色选择器改为**调色盘**（饱和度/明度方阵 + 色相条 + 透明度条） |
| `v1.6.0` | `886e72ddc5a4` | 图谱：自定义颜色支持任意色与透明度（`ColorPicker.vue`，hex/rgb/hsl/rgba 全放行） |
| `v1.5.0` | `45d7d52720d4` | 图谱：拖拽与布局持久化修复、固定只由右键触发、上色改成可排序的颜色规则系统 |
| `v1.4.0` | `f41e416de9b6` | 图谱：控制面板批量上色（按路径/名称/正文圈选）、自定义颜色按用户同步 |
| `v1.3.0` | `b8a194bd4f43` | 图谱：缩略图重绘并着色、连线加深、节点自定义颜色、左栏可收起、右键菜单 |
| `v1.2.0` | `ec68377534dd` | 图谱：MOC 标签策略、聚焦斥力、控制面板、页面标题 |
| `v1.1.0` | `1c983fe652b1` | 图谱三区重构 |
| `v1.0.0` | `36800e565796` | 重构前基线 |

服务器上现存的镜像归档：`/opt/garden-image-v1.2.0.tar` ~ `/opt/garden-image-v2.1.0.tar`，以及 `/opt/garden-image-v2.1.1.tar.gz`、`/opt/garden-image-v2.1.2.tar.gz`（v1.1.0 的 `garden-image-new.tar` 已删；每个版本一份，按版本号即可回滚；v2.0.5 起改用 `.tar.gz`（v2.1.1 316 MB、上传 49 秒；v2.1.2 331 MB、上传 68 秒），其余是裸 `.tar` —— 上传统计 332,249,088 B，秒传约 2 分钟）。

> **v1.4.0 起有 schema 变更**：新增 `GraphColor` 表（迁移 `20261001000000_graph_colors`），由 `entrypoint.sh` 的 `prisma migrate deploy` 在启动时自动应用。**回滚到 v1.3.0 及更早版本时该表会被保留但不再被读取**（老代码不认识它），无需手动 drop；反过来从老版本升到 v1.4.0 也不需要预操作。

> **v1.5.0 又加了一张表**：`GraphColorRules`（迁移 `20261015000000_graph_color_rules`，单行 jsonb 存有序规则数组）。同样是纯新增，升降级语义与 `GraphColor` 一致——回滚到 v1.4.0 时表保留、旧代码不读，用户已配好的规则不会丢。

> **v1.6.0 无 schema 变更**（只放开颜色白名单、新增前端 `ColorPicker.vue`），启动日志是 `No pending migrations to apply.`，回滚到 v1.5.0 无任何数据副作用。注意颜色值的**新写法会被旧版本拒绝**：v1.5.0 及更早的 `normalizeColor()` 只认 `#rgb`/`#rrggbb(aa)`/`rgb()`/`hsl()`/`var(--x)`，若用户已存了 `hsl(160 56% 40%)`（空格语法）这类新写法，回滚后那些条目会被**单条丢弃**（其余颜色不受影响）。

> **v1.7.0 无 schema 变更**（只重写前端 `ColorPicker.vue` 并给 `shared/graph-colors.ts` 补 `rgbToHsv`/`hsvToRgb`），启动日志同样 `No pending migrations to apply.`。颜色值的**存储格式与 v1.6.0 完全一致**（`formatColor()` 没动：不透明写 `#RRGGBB`、半透明写 `rgba(r, g, b, a)`），所以 v1.6.0 ⇄ v1.7.0 双向回滚都不会丢任何用户配色或规则。

> **v1.8.0 无 schema 变更**（只改前端 `GraphView.vue` 的端点归一化 + 连线配色/线宽常量 + 验收脚本），启动日志同样 `No pending migrations to apply.`，双向回滚不丢数据。注意这是**纯前端 bug 修复**：回滚到 v1.7.0 会连带把「大图连线看不见」的问题带回来（SVG 分级的小图不受影响）。

> **v1.9.0 有 schema 变更（两个纯新增迁移）**：`20261020000000_tag_domain_suggestions`（新增 `Suggestion` 待审表 + `Note.domainLevel1` / `Note.domainSource` 两列 + `pending` 部分唯一索引）与 `20261021000000_app_settings`（新增 `AppSetting` 键值表）。首次启动日志会打印 `Applying migration ...` 两行，之后 `All migrations have been successfully applied.`。
> **回滚到 v1.8.0**：两张表与新列**保留但旧代码不读**，无需手动 drop，双向升级/降级都不丢用户数据。若确要清干净，降级 SQL 为
> `DROP TABLE "Suggestion"; DROP TABLE "AppSetting"; ALTER TABLE "Note" DROP COLUMN "domainLevel1", DROP COLUMN "domainSource";`
> —— 但通常**不必执行**：留着无害，重新升到 v1.9.0 时还能保住已审记录与已配好的 AI 设置。
>
> ⚠️ **AUTH_SECRET 轮换的连带影响（v1.9.0 起）**：AI 增强的 API 密钥以 AES-256-GCM 加密存在 `AppSetting` 里，加密密钥由 `AUTH_SECRET` 派生。轮换 `AUTH_SECRET` 会让**已存的 API 密钥解不开**（设置界面会提示「已存的密钥无法解密，请重新填写」，不会静默失效），同时所有登录 cookie 失效。轮换后重新在「管理后台 → AI 增强设置」里填一次密钥即可。

> **v2.0.0 无 schema 变更**（新增功能 + 两处体验修复 + 一个新增宿主目录），启动日志为 `No pending migrations to apply.`，与 v1.9.9 双向回滚都不丢数据。**但回滚前请先看 §2 的目录说明**：v2.0.0 起容器多挂一个 `/opt/digital-garden/data`，回滚到 v1.9.9 时那份编排里没有这个挂载（备份文件仍留在宿主上，只是界面读不到）。
> ① **库备份与恢复（仅初始管理员）** —— `server/utils/backup.ts` 自研容器格式 `GMZ1`（**不用 tar/zip**：本地 `content/vault` 是 Windows junction，系统 `tar` 不跟随会静默打出空包；恢复时全量读进内存又会撞 640M 容器 / 384M 堆限制），`createGzip` 流式写、`createGunzip` 流式读；每份备份同时含 `vault.gmz`（全库 Markdown）+ `db.json`（`Note` 的 maturity/isPublished/domainLevel1/domainSource/时间戳 + 标签名 + 图谱颜色 + `AppSetting`）—— **必须含 DB 元数据**，因为领域的事实源是 `Note.domainLevel1` 而不在 frontmatter 里。保留最近 10 份，可看清单/差异（按 sha256 对比，不解压）/一键恢复；恢复前自动再备一份（kind=`pre-restore`）。
> ② **恢复的两个坑（本轮实测踩到并修掉）** —— 清空 vault 再复制回会触发 524 个 `unlink`，watcher 把整库 Note 行删光又全量重建，`createdAt` 全部变成恢复当天、`updatedAt` 全被刷成同一秒，进而 `scheduleSuggestScan` 认为「全库刚导入」而排队生成 514 条建议。修法：新增 `server/utils/vault-busy.ts`（`beginVaultBusy`/`endVaultBusy`/`isVaultBusy`），watcher 的 `add`/`change`/`unlink` 与 `scheduleSuggestScan` 在整库操作期间直接跳过（结束留 5s 宽限，因为 chokidar 的 `awaitWriteFinish` 稳定窗口是 1s）；重建索引后用 `$executeRawUnsafe` 写回原始时间戳（Prisma 的 `update` 会强行把 `updatedAt` 设为 `now()`）。
> ③ **AI 全库审计（仅初始管理员）** —— `server/utils/audit.ts`：范围可按文件夹/标签/领域/关键词任意组合，先「看看会扫多少篇」再真正跑；每篇交给模型产出**建议**（`append-section` / `add-tags` / `set-domain` 三种动作，刻意不提供「重写正文」），建议与执行分离，**执行前强制整库备份**（备份失败则一条都不执行）。报告按文件存在 `data/audits/<id>.json`，不进数据库（恢复备份时不该带回旧报告）。
> ④ **「未分组」不是缺陷** —— 侧栏标签分组的规则是「标签名里有没有 `命名空间/` 前缀」（`app/composables/useFacets.ts` 的 `buildTagGroups`），领域分配不产生标签，所以无前缀的标签（线上 13 个、197 次引用）永远落在「未分组」。现在展开该组会给出说明与改法，不再让人以为是分配失败。**v2.1.1 起这条已过时**：无前缀标签改由 `shared/tag-group.ts` 按共存证据与笔记目录派生分组，「未分组」组不再出现（标签真名与筛选行为不变）。
### v2.2.0（全链路 UI/UX 升级：可达性 / 触控 / 状态闭环 / 信息架构）

**为什么发这一版**：专家团（UX 架构 / persona 走查 / UI 设计 / 像素验收）对本机 3000 端口外的临时实例 `:3100` 做了实测走查，用 Puppeteer 量出六类**能量化**的缺陷，而不是凭观感改样式：①浅色 `--ink-3 #7B838F` 对 `surface / canvas / surface-2 / surface-3` 实测 3.83 / 3.48 / 3.63 / 3.33，12px 说明文字全部不过 WCAG AA 4.5；②控件描边 `--line #E6E3D9` 对白 1.28、对 canvas 1.17，远低于 WCAG 1.4.11 要求的 3:1；③`focus:outline-none` 17 处，Tailwind 把它编译进 utilities 层、优先级压过 `main.css` 的 `:focus-visible`，`/notes` 与 `/admin` 各有 2 个可聚焦元素**完全没有可见焦点**；④`TagPill` 在没有 `to` 时渲染成没有 `@click` 的 `<button>`，列表页 20 行 × 3 = 60 个死按钮，同时它们都是 22px 触控目标；⑤三个主屏的加载态只有一行「加载中…」文字、没有错误态，首页「常用标签」的骨架分支与外层 `v-if` 互斥成了恒假死代码；⑥首页「最近更新」在 1440×900 视口里 top = **1437px**，要滚 537px 才看得到——而它恰恰是最高频入口。

**上线记录**：2026-11-20 23:0x CST。本地 `docker build -f deploy/Dockerfile -t my-digital-garden-app:v2.2.0 .`（镜像 `ca532d149a1c`，1.5 GB）→ `docker tag …:v2.2.0 …:latest` → `docker save my-digital-garden-app:v2.2.0 | gzip -1 > garden-image-v2.2.0.tar.gz`（**316 MB**）→ `scp -i ~/.ssh/garden.pem garden-image-v2.2.0.tar.gz root@8.163.35.246:/opt/garden-docker/` → 服务器 `docker load -i garden-image-v2.2.0.tar.gz` → 显式 `docker tag my-digital-garden-app:v2.2.0 my-digital-garden-app:latest` → `cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate`。启动日志 `No pending migrations to apply.` → `[garden] 迁移完成，启动应用...` → `[garden] watcher: 开始监听 /app/content/vault` → `Listening on http://[::]:3000`；容器即起后 `/login` 200。服务器 classic store ImageID `15b3aea45c6e`（`latest` 与 `v2.2.0` 同一 ID），内存 98.88 MiB / 640 MiB。回滚镜像 `bf9400a5d018`（v2.1.2）。

**改了什么**：

- **令牌（`app/assets/css/main.css`）**：亮色 `--ink-3` `#7B838F` → `#616A77`（对四底色 5.47 / 4.97 / 5.20 / 4.76）；暗色 `--ink-3` `#78829A` → `#828CA0`（暗色原值对 `surface-3 #1C222E` 只有 4.14，改后 4.71，与 `--ink-2 #A8B1C1` 仍留 1.57 层次差）；新增 `--line-strong`（亮 `#8E8778`、暗 `#5C6A7B`）专管控件边界与输入框描边，实测 3.57 / 3.24（暗 5.52 / 5.01），卡片装饰描边继续用 `--line`（非交互元素不受 1.4.11 约束，全库 116 处一并改强会让界面发脏）。
- **焦点**：删 17 处 `focus:outline-none`（13 个文件）+ `app/pages/notes/[...slug].vue` 编辑用 textarea 的 `outline-none`；`:focus-visible` 规则去掉 `border-radius: var(--r-6)`——胶囊聚焦时不再从 9999px 跳到 6px。`AppDialog` / `TreeContextMenu` 的**容器级** `outline-none` 保留（`role="dialog"` 与菜单容器由脚本管理焦点，容器描边只是噪声）。
- **死控件**：`app/components/TagPill.vue` 改成三态——有 `to` 走 `NuxtLink`、有 `@click`（`useAttrs().onClick`）走 `button`、否则渲染 `<span>`。列表页 60 个死按钮归零，同时消掉 60 个 22px 触控违规。
- **触控热区**：`main.css` 加 `.tap-y`（只纵向撑到 `max(100%, 44px)`，横向保持原宽以免相邻胶囊抢点击）与 `.tap-44`（四向），用 `::after` 覆盖层而不是放大盒子——放大盒子会改行高把列表撑变形。命中判定用 `document.elementFromPoint` 从中线上下各探 24px 量「有效命中高度」，390px 宽下 under44 由 **75 → 0**（首页 58 个可交互元素、`/notes` 40 个）；`StatusBadge` / `DomainChip` / `TagPill` 三个胶囊加 `tap-y`，`TocRail` 目录项 21 → 40px，`Pagination` 与顶栏抽屉/搜索/用户菜单/新建按钮 36~38 → 44px。
- **状态闭环**：新增 `app/components/NoteListSkeleton.vue`（`min-h-[76px]` 行 + `animate-pulse`，与真实行同高避免 CLS）；`EmptyState.vue` 增 `variant="error"` 与 `retry` 事件；`/browse`、`/notes` 的 `加载中…` 换成骨架、并补 `loadError` + 重试；首页「最近更新」补错误态；`v-if="topTags.length"` 改为 `|| tagsPending`（原内层 `!length && pending` 与外层互斥，是恒假死分支），整块再包 `<ClientOnly>` 消除 hydration mismatch（标签是 `server:false` 取数，SSR 出空、hydration 出骨架）。
- **信息架构**：首页「最近更新」从主列末尾提到统计卡之后（top 1437 → **424**，进入首屏）；`/browse` 由「首页分类卡里的链接」提为一级导航（`useNavItems.ts` 增 `{ to:'/browse', icon: Compass, label:'分类' }`，RailNav 与 BottomTabBar 同源自动生效，底栏 3 → 4 项）；正文 `.prose` 16 → 17px（仍是 720px 定宽列，45 → 42.4 字/行，落在中文舒适区）。
- **Tailwind 键补齐（`tailwind.config.js`）**：`borderRadius` 3 → 6 键（`xs 6` / `ctl 8` / `card 16` / `overlay 20` / `pill 999` / `fab 16`）——补上 `pill` 后原先 4 处 `rounded-pill` 才真正生成圆角；新增 `maxWidth.measure = var(--measure)`（v3 的 `maxWidth` 不继承 `spacing`，这是 `--measure` 令牌全库 0 引用的根因），详情页 `max-w-[720px]` 改 `max-w-measure`；19 处任意值圆角（`rounded-[3px]/[4px]/[6px]/[17px]/[26px]/[36px]`）收敛到 `rounded-xs/rounded/rounded-fab/rounded-pill`。
- **z-index 定档**：command `1000` < sheet `1100` < dialog `1200` < popover/菜单 `1300` < toast `1400`（旧值 100/110/120/130 里 dialog 与 sheet 同为 110/120，对话框会被抽屉盖住）。
- **`ImportDialog.vue` legacy 调色板**：58 处 `garden-*` / `slate-*` / `red-*` / `amber-500` / `rounded-xl|lg` / `glass-card` / `transition-all` 批量替换为设计令牌（`accent`、`ink` / `ink-2` / `ink-3`、`line` / `line-strong`、`surface-*`、`danger*`、`seedling`、`rounded-card|ctl`、`transition-colors`），白字 `bg-garden-500` 3.32 与 `text-slate-400` 2.56 两处低对比一并消失。

**验收**（全部为 `:3100` 生产构建上的实测，非估算）：

- 双主题探针：亮色 `--ink-3 #616a77` 六处采样 5.47 / 4.97 / 5.20 / 4.76 / 5.20 / 4.97，暗色 `#828ca0` 5.40 / 5.75 / 5.15 / 4.71 / 5.15 / 5.75；控件描边亮 3.57 / 3.24、暗 5.52 / 5.01。
- 焦点：`/notes` 与 `/admin` 各 30 个可聚焦元素，两主题下不可见焦点 **0 / 0**（改前各 2）。
- 死按钮：`tagLikeButtons` **0**（改前 60），列表行仍 20 行。
- 触控：390×844 下 under44 首页 0 / `/notes` 0（改前 113 个里 75 个）。
- 信息架构：`homeOrder` 最近更新 424 → 按目录 1630 → 按类型 2063 → 按成熟度 2412；`navItems` `["/","/notes","/browse","/admin"]`；正文 `fontSize 17px / lineHeight 31.45px / width 720`。
- hydration：四路由（`/`、`/notes`、`/browse`、`/admin`）控制台 **0 报错**（改前 `/` 报 `Hydration completed but contains mismatches.`）。
- 验收套件：`m-verify` **47/47**、`m34-verify` **39/39**、`e4-check` **49/49**、`e4-regression` **44/44**、`picker-verify` **16/16**。`suggest-verify` / `suggest-entries` 在本机有 FAIL，根因是**环境**：`/api/admin/suggestions/meta` 显示 `{"pending":1490,"llm":{"enabled":false}}`（本机无 LLM 密钥，建议生成走回退），且服务端报 `Foreign key constraint violated on the constraint: Suggestion_noteId_fkey`（笔记文件刚落盘、`Note` 行尚未入库就触发建议生成）；历史日志里 v2.0.2 时期同一条也 FAIL，与本次改动无关。
- 线上核验：`https://liutianle.cn/login` **200**；首屏 CSS `/_nuxt/entry.1EBWAXHk.css` 实测含 `--ink-3:#616a77`、`--ink-3:#828ca0`、`--line-strong:#8e8778`、`--line-strong:#5c6a7b`、`rounded-pill{border-radius:999px}`、`max-w-measure{max-width:var(--measure)}`。

> **v2.2.0 无 schema 变更**（未动 `prisma/migrations`，启动日志 `No pending migrations to apply.`），与 v2.1.2 双向回滚都不丢数据。回滚：
>
> ```bash
> cd /opt/garden-docker
> docker tag my-digital-garden-app:v2.1.2 my-digital-garden-app:latest
> docker compose -f docker-compose.prod.yml up -d --force-recreate
> docker inspect -f '{{.Image}}' garden-app   # 应为 sha256:bf9400a5d018...
> ```
>
> 回滚后功能层面**只剩前端资源差异**（旧 CSS/JS 由旧镜像自带），无需清理数据库。

### v2.1.2（首屏树与标签改客户端取数，根治「文档被掐断 → 侧栏点不动」）

**为什么发这一版**：用户录屏复现「打开站点后左侧目录树点不开、过滤框只输入不生效，刷新 1~3 次才好」。定位链条：本地 prod 同代码同构建正常 → 线上 CDP 点行 `aria-expanded` 不变、`elementFromPoint` 命中在行内（没被遮挡）、`_nuxt/*.js` 全 200、console 零报错 → 典型「HTML 文档被截断 ⇒ 不水合」→ `curl` 复现 `curl: (18) transfer closed with outstanding read data remaining`，`Accept-Encoding: identity` 时正好断在 **524,288 B（512 KiB）** → 直连 `127.0.0.1:3000` 6/6 完整、直连 nginx 443 8/8 完整、走 CDN 8 次坏 2 次 ⇒ 掐断发生在云厂商 CDN 边缘，只对「chunked + 近 800 KB 的 HTML」这条路径发作。

**上线记录**：2026-11-20 19:2x CST。本地 `docker build -f deploy/Dockerfile -t my-digital-garden-app:v2.1.2 .` → 镜像 `7f56115fa52b` → `docker tag …:v2.1.2 …:latest` → `docker save …:v2.1.2 | gzip -1 > garden-image-v2.1.2.tar.gz`（331,179,741 B，md5 `6ba67082fd886ddee262e6346a31a3aa`，scp 68 秒）→ 服务器 `docker load -i /opt/garden-image-v2.1.2.tar.gz` → 显式 `docker tag my-digital-garden-app:v2.1.2 my-digital-garden-app:latest` → `cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate`。日志 `[garden] 迁移完成，启动应用...` + `[garden] watcher: 开始监听 /app/content/vault` + `Listening on http://[::]:3000`；容器 `4aa727285a0b`。回滚镜像 `18d4f9aaa78f`（v2.1.1）。

**改了什么**：

- **目录树改客户端取数（`app/composables/useFacets.ts`）**：`useAsyncData('vault-tree', () => requestFetch('/api/vault/tree'), { server: false, lazy: true })`。树 449,862 B 曾整体序列化进首屏 `__NUXT_DATA__`，是 795 KB 文档的 90%；服务端不渲染它，文档就再也长不大（vault 继续涨也不怕）。顺带把 `treePending` / `treeError` / `reloadTree` 暴露出去。
- **侧栏三态（`app/components/ContextSidebar.vue`）**：`error` → 「目录树没能加载出来」+ 重试按钮；`pending` → 6 条 `h-6 rounded-md bg-surface-3 animate-pulse` 骨架；否则 `<FileTree>`。用 `const mounted = ref(false)` + `onMounted` 钉住首帧——否则服务端 pending 恒 false、data 恒 null，SSR 出空树而客户端首帧出骨架，实测报 `Hydration completed but contains mismatches.`，加 mounted 后归零。
- **标签同样改客户端取数**：`useAsyncData('sidebar-tags', () => requestFetch('/api/tags'), { server: false, lazy: true })`；侧栏标签面板与首页「常用标签」各有骨架（`h-5` 条 / 8 个 pill 占位）。标签 3,563 个 / 204,228 B，只是侧栏三面板之一、首页只用前 12 个。
- **`server/utils/markdown-sanitize.ts`**：修 5 处既有 typecheck 错误——`let body = m[2] ?? ''`、`const line = lines[i] ?? ''`（`noUncheckedIndexedAccess` 下 `CODE_SPAN_RE` 的分组与数组下标都是 `string | undefined`）。

**验收**：

- `npx pnpm typecheck` **0 错误**（v2.1.1 时还剩这 5 条）；`npx pnpm build` 通过。
- 首屏文档（本地 prod `:3211`）：802,626 B → 324,817 B（树拿掉）→ **81,666 B**（标签再拿掉），payload 722,128 → 249,342 → 10,309 B；`/notes 107,252`、`/browse 31,402`、`/admin 68,688`。
- 线上 `https://liutianle.cn/`：连抓 3 次全部 200、**82,426 B**（gzip 16,453 B）、payload 10,643 B、以 `</html>` 收尾、文档内已无 `/api/vault/tree`。
- 线上 CDP 真浏览器：树 4.2 s 出现（改为客户端 fetch 后的等待）、点首行 `4 → 15` 行展开、标签面板 1,104 个 chip、首页常用标签 12 个 pill、`aside` 宽 320、`__vue_app__` 存在、**console 零报错**。
- 镜像内容自检：`docker run --rm --entrypoint sh …:v2.1.2 -c "grep -rl treePending /app/.output"` 命中 `_nuxt/BrCLAq9U.js`、`_nuxt/CZj8W443.js`、`server/chunks/build/useFacets-vkJ2yjtX.mjs`。

**同期的 nginx 兜底（不随镜像走，独立生效）**：在 `/etc/nginx/conf.d/garden.conf` 的 `location /` 内加 `proxy_buffering on; proxy_buffers 32 64k; proxy_buffer_size 64k; proxy_busy_buffers_size 128k; proxy_max_temp_file_size 0; gzip on; gzip_proxied any; gzip_min_length 1024; gzip_types text/html text/plain text/css application/json application/javascript application/xml;`（备份 `/etc/nginx/conf.d/garden.conf.bak-<时间戳>`，`nginx -t` 通过后 `nginx -s reload`）。改前 CDN 8 次坏 2 次，改后服务器 20 次 + 本机 30 次 = **50/50 完整**。回滚：`cp -a /etc/nginx/conf.d/garden.conf.bak-* /etc/nginx/conf.d/garden.conf && nginx -t && nginx -s reload`。

> **v2.1.2 无 schema 变更**，双向回滚不丢数据。回滚：
>
> ```bash
> docker tag my-digital-garden-app:v2.1.1 my-digital-garden-app:latest
> cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate
> ```

---

### v2.1.1（侧栏宽度与拖拽卡死、右键删除静默失效、标签归组）

**上线记录**：2026-11-20 15:23 CST。本地 `docker build -f deploy/Dockerfile -t my-digital-garden-app:v2.1.1 .` → `docker tag …:v2.1.1 …:latest` → `docker save …:v2.1.1 | gzip -1 > garden-image-v2.1.1.tar.gz`（316 MB，md5 `542e42ed62d92adc8f628012b8d0a8e3`，scp 49 秒）→ 服务器 `docker load -i /opt/garden-image-v2.1.1.tar.gz` → 显式 `docker tag my-digital-garden-app:v2.1.1 my-digital-garden-app:latest` → `cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate`。启动日志 `No pending migrations to apply.` + `[garden] watcher: 开始监听 /app/content/vault`；容器内存 165 MiB / 640 MiB，宿主余 913 MB。回滚镜像 `ee065a95720d`（v2.1.0）。

**改了什么**：

- **侧栏宽度（`app/layouts/default.vue`）**：`onMounted` 只接受 240~440 的整数，`NaN`/`abc`/`1280`/`640` 这类 localStorage 脏值一律丢弃并**删键**回默认 320（此前脏值会让 `--sidebar-w` 变成 `NaNpx` 由内容撑宽、或被 `Math.min(440, …)` 夹到 440，两种都表现为「打开网站侧栏比默认宽」且会一直跟着刷新走）。
- **拖拽卡死**：`startResize` 补 `setPointerCapture`（捕获丢失时仍能收到 `pointerup`），`finishResize` 幂等收尾并挂到 `pointerup` / `pointercancel` / `window.blur` / `visibilitychange` 四路——此前 `resizing` 永久为 true，之后鼠标一动侧栏宽度就跟着跑、`body` 的 `col-resize`/`user-select:none` 撤不掉，表现就是「侧栏变宽、整页点不动」。
- **补 `onBeforeUnmount`**：此前 4 个全局监听（pointermove / pointerup / keydown / click）一个都没移除。
- **窄→宽切回**：`watch(isNarrow)` 记录「是不是被自动收起的」，切回宽屏时自动恢复，否则容器宽 0 且拖拽手柄被 `v-if="sidebarOpen"` 隐藏，桌面上再也拖不出来。
- **右键删除（`TreeContextMenu.vue` / `ContextSidebar.vue` / `server/api/vault/nodes/index.delete.ts`）**：菜单项不再用原生 `disabled`（浏览器对 disabled 按钮不派发 click，这正是「点了毫无反应」的根因），改 `aria-disabled` + 置灰 + `emit('blocked')` 由侧栏 toast 说明原因；权限从「非空文件夹仅初始管理员可删」收紧为「有写权限即可，结构目录仍受保护」，服务端同步去掉那条 403；删除成功后刷新 `vault-tree` / `sidebar-tags` / `overview`（原来只刷树，标签面板与状态栏统计不更新），失败 toast 附 HTTP 状态码。
- **标签归组（新增 `shared/tag-group.ts` + `server/api/tags/index.get.ts` + `app/composables/useFacets.ts` + `app/components/TagGroups.vue`）**：服务端一次遍历 `NoteTag` 建立「同篇共存」与「笔记目录」统计，按 ①人工映射（currently 只有 `专题索引 → type`）②共存证据 support ≥ 2（排除 `type`/`status`/`maturity`/`来源`/`source` 与 `NN-xxx` 目录式命名空间）③笔记所在目录派生的领域 ④标签自身命名空间（`T/xxx` → `T`）⑤其余才是 `其他` 的顺序给每个标签定组；`/api/tags` 多返回一个 `group` 字段，**标签真名不动**，点击筛选仍按原名走，「未分组」组随之消失。同组内出现同名标签（`前端/CSS` 与裸标签 `CSS`）时整组改用全名显示，避免两个长得一样的 chip。

**验收**：

- `npx pnpm typecheck`：只剩 `server/utils/markdown-sanitize.ts` 的 5 条 pre-existing 错误；`npx pnpm build` 通过。
- 本地 prod（`:3211`）+ CDP 实测：localStorage 写 `abc`/`1280`/`640` → 侧栏 320 且键被清空；`400` → 400；`440` 保留；拖拽到 440 上限后 `window.blur` 再移动指针，宽度稳定、`cursor=""`、`user-select=auto`。视口 1536↔900↔1536 与 `ctrl+\` 开关正常。
- 本地临时 admin 身份删非空文件夹：确认弹窗 → `DELETE /api/vault/nodes` 200 → 树/标签/统计三处刷新 → toast（此前是 403）。
- 线上：`/api/tags` 3563 条、534 组、`group` 缺失 0 条、含「未分组」0 条；抽样 `专题索引→type`、`类型系统→编程语言`、`React/CSS/Web-API→前端`、`Flutter→客户端`。CDP 在 `https://liutianle.cn` 上复测脏值/合法值/宽度全部符合预期；客户端 bundle（`/_nuxt/CgKWojlp.js`）含新文案「文件夹会连同其中的全部笔记一起删除，不可撤销」且旧文案「未分组」说明已消失。

> **v2.1.1 无 schema 变更**（没动 `prisma/migrations`，启动日志 `No pending migrations to apply.`），与 v2.1.0 双向回滚都不丢数据。回滚：
>
> ```bash
> docker tag my-digital-garden-app:v2.1.0 my-digital-garden-app:latest
> cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate
> ```

---

### v2.1.0（移除知识图谱页，首页改笔记总览仪表盘）

**上线记录**：2026-11-14 16:25 CST。`docker load -i /opt/garden-image-v2.1.0.tar` → 显式 `docker tag my-digital-garden-app:v2.1.0 my-digital-garden-app:latest` → `cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate`；第 3 次探测（约 6 秒）`/login` 返回 200；启动日志含 `No pending migrations to apply.` 与 `[garden] watcher: 开始监听 /app/content/vault`；容器内存 93 MiB / 640 MiB。回滚镜像 `d024300f6fac`（v2.0.5）已记入 `/opt/garden-backup/rollback-image-id.*.txt`。

**改了什么**：

- **删掉图谱**：`app/pages/graph.vue`、`app/components/GraphView.vue` + `app/components/graph/*`（9 个）、`app/composables/useGraph{Data,Filter,Colors,ColorRules}.ts`、`app/lib/graph-*.ts`、`server/api/graph/*`（配色与规则共 6 个端点）、`server/api/notes/graph.get.ts`、`server/api/notes/graph/match.get.ts`、`shared/graph-colors.ts`、`scripts/acceptance/graph-verify.mjs`。原因：1200 篇规模下 `/api/notes/graph` 每次请求都要全量算节点 + 标签共有边（`MAX_TAG_GROUP_SIZE` 截断后仍是 O(n²)），页面自己也卡，而它实际没人用。
- `shared/graph-domain.ts` → `shared/domain.ts`（领域解析仍被列表 chip 与侧栏使用，只改名不删逻辑）。
- **新增 `GET /api/overview`**：一次 `findMany(isPublished)` + 内存分桶，返回 `total / links / isolated` + `sections`（slug 前两段）/ `types`（`type/*` 标签 + 未分类）/ `maturity`，30 秒进程内缓存。
- **首页重写为仪表盘** `app/pages/index.vue`：笔记总数 / 双向链接 / 孤立笔记 / 目录数 四格 + 按目录、按类型、按成熟度三段卡片（点卡片进分类页）+ 最近更新 + 右栏。
- **新增 `app/pages/browse.vue`**：`/browse?kind=dir|type|maturity&value=…`，复用 `/api/notes`（`dir` / `type` / `maturity` 三个新增参数），列表点进正文。
- 侧栏第二个 Tab 由「领域」改「目录」（原领域轴 920/1212 落「其他」，等于空筛选）；导航 4 项 → 3 项（首页 / 笔记 / 后台）。
- Prisma 的 `GraphColor` / `GraphColorRules` 两表与 `server/utils/backup.ts` 的 `graphColors` 导出**保留**：不写破坏性迁移，旧库备份仍可原样回灌。

**为什么分类轴用目录不用领域**：`resolveDomain` 只认 `NN_Knowledge/<领域>` 这种路径，实测 1212 篇里 920 篇落进「其他」兜底桶，做成卡片就是一堵「其他 920」的墙；目录（slug 前两段）分出 24 个真实分区，且直接对应 `/api/notes?dir=` 前缀筛选。

**验收**：

- `npx pnpm typecheck`：只剩 `server/utils/markdown-sanitize.ts` 的 8 条 pre-existing 错误（与本次改动无关）。
- 本地浏览器（1280×800 + 390 宽屏、Cookie 登录态）：首页三段卡片、`/browse?kind=dir|type|maturity` 的标题/面包屑/排序/密度/分页全部通过。
- 线上：`/login` 200、`/` 与 `/browse` 302（未登录跳登录）、`/api/overview` 401；产物里有 `routes/api/overview.get.mjs`、`routes/api` 下已无 graph 路由、客户端 bundle 含「分类总览 / 按目录」字样。

> **v2.1.0 无 schema 变更**（没动 `prisma/migrations`），与 v2.0.5 双向回滚都不丢数据。回滚：
>
> ```bash
> docker tag my-digital-garden-app:v2.0.5 my-digital-garden-app:latest
> cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate
> ```

---

### v2.0.5（行内代码显示字面反引号）

**症状**：笔记正文里本该是浅底胶囊的 `<code>`，在页面上显示成 `` `xxx` ``（前后各多一个反引号），看起来像「Markdown 没渲染」。表格、`<br>`、标题都正常 —— 只有行内代码中招。

**根因（不在 Markdown 管线）**：`@tailwindcss/typography` 默认给行内代码加引号装饰：

```css
.prose :where(code):not(:where([class~=not-prose],...)):before,
.prose :where(code):not(:where([class~=not-prose],...)):after { content: "`" }
```

HTML 一直是完好的（`<td><strong><code>constant</code></strong></td>`，整页反引号字符数 = 0），是 CSS 伪元素把反引号画在了代码两侧。

**修复**：`app/assets/css/main.css` 末尾追加（同 cascade 后位，特异性也更高，压过插件的 `:where()` 零特异性规则）：

```css
.prose code::before, .prose code::after,
.prose :where(code)::before, .prose :where(code)::after { content: none; }
.prose :where(code):not(:where(pre code)) { background: color-mix(in srgb, var(--ink) 7%, transparent); border: 1px solid var(--line); border-radius: 4px; padding: 0.12em 0.36em; font-size: 0.9em; font-weight: 500; color: var(--ink); overflow-wrap: anywhere; }
```

**同时带上渲染管线加固**（`server/utils/markdown-sanitize.ts`，`RENDER_VERSION` 5 → 6）：

- 表格行里代码跨度内的裸 `|` 转 `\|`（GFM 表格内会还原成 `|`，不再切断单元格 —— 实测 `<code>ps aux | grep proot</code>` 由「反引号外露」变为正常）；
- 代码跨度内的 `$`、以及落单/跨代码跨度假配对的 `$` 换成占位符 `\uE000`，渲染后还原，避免 remark-math 把正文吞成行内公式（`${VAR}`、`$uri`、`($99/年)` 这类）；
- 全库 524 篇对比验证：残留反引号 27 → 0；真实 KaTeX 公式零损失（`运算方法与运算器` 15 个、`STM32` 81 个保持不变）。

> **v2.0.5 无 schema 变更**，启动日志为 `No pending migrations to apply.`，与 v2.0.4 双向回滚都不丢数据。
> 注意本版新增了 `server/utils/markdown-sanitize.ts` 这个**新文件**：回滚到 v2.0.4 时老镜像自带老 `.output`，不受影响。

### v2.0.4（AI 审计失败率修复）

线上第一次跑「AI 全库审计」是「匹配 280 篇 · 已扫 60 篇 · **模型失败 59 篇**」，
容器日志里 119 行全是同一条 `llm-json: 返回内容无法解析为 JSON` —— 没有超时、
没有 HTTP 错误，说明请求成功但正文不是合法 JSON。`max_tokens` 截断的 JSON
既不是合法 JSON，也过不了「首个 `{` 到末个 `}`」的兜底，于是一整篇白跑。

分三步修（v2.0.3 + v2.0.4 两次上线）：

1. **能看见**：审计报告新增 `failReasons`（最多 8 条），把「输出被
   max_tokens(N) 截断」/「返回内容不是合法 JSON」等原因连同原文开头 200 字
   记下来，`AuditPanel.vue` 用 `data-testid="audit-fail-reasons"` 摊开显示。
   此前界面上只有一个「失败 59 篇」的数字，用户无从判断是超时、限流还是截断。
2. **能自愈**：`llmJson` 默认重试 2 次，第 2 次起放大 `max_tokens`（×2.5，
   上限 8000）、超时翻倍、温度降到 0.1，并追加「必须是完整 JSON」。4xx（除
   429）直接放弃 —— 密钥或模型名错了，重试只是浪费用户时间。
3. **能抢救**：放弃之前用新增的 `salvageArray` 按「字符串转义 + 括号配对」
   扫出 `issues` 里已经写完的元素，逐个 `JSON.parse`，只留完整的。线上原文
   显示模型经常把第 1、2 条写得很好、第 3 条写到一半撞上上限 —— 那两条不该
   跟着被丢掉。

同时收紧审计诉求以减少触发截断：最多 3 条 → 2 条、`detail` ≤ 80 字、
`append-section` 的 body ≤ 150 字、扫描上限 60 → 200（用户要求）。

实测（同一范围 `KnowledgeBase/03_Knowledge`、同样 60 篇）：

| 版本 | 失败篇数 | 建议数 | 用时 |
|---|---|---|---|
| v2.0.1（报障时） | 59 / 60 | 2 | — |
| v2.0.3 | 25 / 60 | 91 | 450s |
| v2.0.4 | **0 / 60** | 116 | 243s |

生产上留了两份报告可对比：`20261025-135921-3mkr`（v2.0.3，25 条失败原因可展开）
与 `20261025-142726-jess`（v2.0.4，0 失败）。

> **v2.0.4 无 schema 变更**（纯服务端重试/抢救策略 + 前端展示 + 上限），启动日志为
> `No pending migrations to apply.`，与 v2.0.3 / v2.0.2 双向回滚都不丢数据。

> **v2.0.2 无 schema 变更**（纯业务逻辑 + 前端状态修复 + 一次数据回灌），启动日志为 `No pending migrations to apply.`，与 v2.0.1 双向回滚都不丢数据。
>
> 本次修掉三处「数字对不上」并处理一个**正在损坏数据**的缺陷：
>
> ① **审核通过会用建议标签整体覆盖笔记原有标签（数据损坏）**：审核面板的 `draft.tags` 语义是「通过后这篇笔记的完整标签列表」（模板里「现有标签（取消勾选即从笔记中移除）」按 `draft.tags.includes(t)` 判保留），但初始化时只放了建议标签、没并入现有标签 —— 于是每条现有标签都被渲染成「已移除」，点通过就把它们整批删掉。线上后果：`Java`(49 篇)、`后端`(47)、`前端`(40)、`数据库`(26)、`跨学科纵深`(10) 等裸标签的引用被清空，变成标签页里「0 条笔记」的幽灵标签。修复：draft 初始化改为「现有 ∪ 建议」；服务端把 `removedTags` 写进 `appliedValue` 与响应；面板检测到非空时 `toast.warn` 并告诉用户如何加回。
> ② **徽标 / 名单 / 库三者数字对不上**（用户原话「待审核建议显示十条但是点进去却没有」）：徽标读 `/meta`、名单读 `/suggestions`，两条路径各有各的时机。现在面板每次 load 把全库待审数写回 `useSuggestionReview` 的 `pendingTotal`，徽标直接读它 —— 同源之后不会再「说有却没有」。名单改按服务端上限 `limit=500` 拉取，被上限截断时界面明说（`data-testid="review-truncated"`）；生成结束后用 `settlePending` 等队列落定（连续三次读数相同、最多 30s，读失败不放弃）。
> ③ **点「开始生成」后审核面板要等判定完才弹**：`generate()` 原本 POST → `loadSuggestMeta` → `openReview` 串行（实测 2620ms）。改为先 `openReview` 再 POST，判定期间面板显示「正在判定…」，结果回来靠 `reloadToken` 自动刷新。实测 20ms。
> ④ **0 条笔记的标签还留着**：`Tag` 行只在标签第一次写进笔记时创建，失去最后一个引用时从不删除。现在 `GET /api/tags` 过滤 `_count.notes > 0`，新增 `server/utils/tags-gc.ts` 的 `pruneOrphanTags()` 在审核末尾异步清理，自动判定的候选池也加 `where notes.some` 避免把没人用的名字当「既有标签」推荐。
>
> **数据回灌（一次性，已执行）**：用生产备份 `20261025-040116-5oj7/db.json`（2026-10-25T04:01Z，即 12:01 北京时间）以**并集**方式补回被覆盖的标签 —— 77 篇笔记、308 处引用，**只补不删**。回灌前后：`Java 0→49`、`后端 0→47`、`前端 0→40`、`数据库 0→26`、`跨学科纵深 0→10`、`运维 0→20`、`status/进行中 230→251`。回灌走生产自己的 `PATCH /api/vault/notes/<slug>`，因此 frontmatter 与 DB 一起更新；动手前另存了备份 `20261025-081532-y349`（kind=manual）。**12:01 之前发生的覆盖不在任何备份里，无法回灌**（当时还没有备份功能）。
>
> **验证**：`pnpm typecheck` EXIT=0；`tag-keep-probe` 12/12、`tag-drop-probe` 6/6、`panel-open-probe` 6/6；`pnpm acceptance:all` 除已知噪声 `G99` 外全绿（`m-verify` 47/47、`m34-verify` 43/43、`graph-verify` 119/120、`picker-verify` 16/16、`suggest-entries-verify` 13/13，`suggest-verify` 仅 `D2` 一项环境噪声）；生产只读 `pnpm acceptance:prod` **19/19**，另有只读核对 7/7（`meta` 与名单待审数一致、`/api/tags` 零引用 0 个、五个裸标签引用数已恢复）。

> **v2.0.1 无 schema 变更**（纯标签生成策略 + 一个前端状态修复），启动日志为 `No pending migrations to apply.`，与 v2.0.0 双向回滚都不丢数据。
> ① **杜绝无命名空间标签**（用户报障）—— 线上 13 个无前缀裸标签（`Java` 49 次、`后端` 47、`前端` 40…）与 `Java/基础`、`前端/Vue` 是两套并存体系：侧栏把它们全塞进「未分组」、图谱标签边分裂。只在候选池过滤不够（模型返回值也过同一份白名单），所以在 `server/utils/tag-suggest.ts` 的打分与 `server/utils/suggest.ts` 的落库出口两处都设硬约束，裸标签分五级、每级都写可读依据：已带命名空间 → 原样；有共存证据 → 补成 `后端/Java`；它本身就是命名空间（`Java`/`前端`/`运维`）→ 跳过（补成 `Java/Java` 是废标签）；无证据 → 退回**本篇领域名**当命名空间；连领域名都判不出 → 跳过并写明原因。兜底领域值「其他」不当前缀（`其他/Docker` 比裸标签更没信息量）。
> ② **「自行创建命名空间需要我同意」如何落实** —— 建议本身不写任何笔记：`新建命名空间「X」` 只是理由里的一句话，只有审核面板逐条通过、审核者看见这句话，该命名空间才会随标签落库。为此把命名空间说明从内存态的 `reason` 搬进落库的 `rationale`（否则界面上根本看不到自己在批准什么）。
> ③ **多选器重开后勾选归零**（用户报障）—— `selected` 是组件自身状态、`AppDialog` 只 `v-if` 了内容，关闭不卸载；而上一轮那些笔记此刻已生成待审建议，再打开时默认筛选「还没有待审」根本列不出它们，勾选却还在（「已选 49 篇」指向一批看不见的笔记）。改为 `watch(props.open)` 打开时先清空再加载。
> ④ 验证：`pnpm typecheck` EXIT=0；本地 `namespace-probe2` 22/22（造数据覆盖五级分支：`excalidraw`→`type/excalidraw`、`ZnsNs` 本身是前缀被跳过、`ZnsBare3`→`运维/ZnsBare3`、`ZnsBare4` 判不出领域被跳过；另 200 篇大样本 1464 个标签裸标签 0 个；多选器关闭再打开 `count 2 → 0`）；生产 `pnpm acceptance:prod` 19/19，容器内 `selfNamespace`/`inferNamespace`/`hasNamespace`/`droppedBare` 四个标识符均命中产物。
> ⑤ **已知环境噪声（非本次引入，已用 `git stash` 对照证实）**：本地 `acceptance:suggest` 的 `D2`/`A6`/`K2`/`K5` 四项在改动前后同样失败 —— 开发环境 watcher `ignoreInitial: false` 全量重扫把 524 篇 `updatedAt` 刷成同一时刻，排序退化后特定 slug 掉出 `/api/notes?pageSize=100/200` 窗口（`K2`/`K5` 还叠加探针遗留的 pending 把 limit 窗口占满）。生产是 `ignoreInitial: true`，不受影响；`G99` 同上一条 v2.0.0 说明。

> ⑤ **多选器弹窗挡住确认框**（用户报障）—— `generate()` 里 `await confirm(...)` 排在 `emit('update:open', false)` 之前，两个浮层同 z 层互相遮挡，用户点不到「开始生成」只能手动叉掉；改为先关多选器再弹确认。
> ⑥ **权限** —— 备份/审计/恢复全部走新增的 `requireBuiltinAdmin`（`role === 'root' && isBuiltin === true`），普通管理员与普通用户均 403。
> ⑦ 部署侧：`deploy/docker-compose.prod.yml` 增加 `GARDEN_BACKUP_DIR: /app/data/backups`、`GARDEN_AUDIT_DIR: /app/data/audits` 与 bind mount `- /opt/digital-garden/data:/app/data`（容器 `--force-recreate` 会丢容器内文件，而备份的唯一价值就是跨重启可恢复；显式声明同时让界面判为「持久存储」）。**上线前需在服务器 `mkdir -p /opt/digital-garden/data` 并更新该文件**（见 §3）。
> ⑧ 验证：`pnpm typecheck` EXIT=0；本地 `backup-audit-probe` 32/32（起假模型 `127.0.0.1:3199`，含备份→改文件→差异→恢复→审计→执行→权限 403 全链路）、`admin-panels-probe` 11/11、`ui-fixes-probe` 13/13；生产 `prod-backup-verify` 15/15（`persistent=true`、`keep=10`、首次整库备份 `files=531 bytes=4749499 noteCount=526`）、`pnpm acceptance:prod` 19/19。
> ⑨ **已知未修（脚本已随图谱页一并删除，仅存档）**：`acceptance:graph` 的 `G99 刷新后节点位置保持`（graph-verify 119/120）—— 刷新后存档里 `pos` 为空、位置全部重排。已确认不是本轮引入（`.workbuddy/acceptance-all2.log` 在 10-06 时是 120/120），试过「空 `nodeData` 时不 persist」，虽能让 G99 通过却把 G92/G93/G98/G100–G106 打挂，已回退，留待单独排查。

> **v1.9.9 无 schema 变更**（纯前端 + 仓库布局），启动日志为 `No pending migrations to apply.`，与 v1.9.8 双向回滚都不丢数据。本次修掉三处体验缺陷、并整理仓库布局：

> ① **删除正在查看的笔记后停在死页面**（用户报障）—— 结构树的删除（`app/components/ContextSidebar.vue` 的 `case 'delete'`）删完只刷新结构树，既不跳转也不提示，于是主界面继续显示一篇已经不存在于库里的笔记。现在删掉的正是当前笔记（或它所在文件夹里的笔记）时退回 `/notes`，并 `notesRev++` 让列表/图谱跟着刷新。详情页「更多操作 → 删除笔记」与列表长按删除这两条路径本来就有跳转，只有结构树这条漏了。
> ② **新增 `app/error.vue`** —— 此前没有错误页，任何加载失败（最典型是详情页 404）都只看到 Nuxt 默认页，观感就是「一片空白、连标题和按钮都没有」。现在给出「这篇笔记打不开」+ 可能原因 + 重试 / 回到笔记列表 / 首页 三个出口，并把状态码与原始 message 放进弱化等宽块，便于对照容器日志。
> ③ **新增 `app/composables/useCreateNote.ts`** —— 把「POST 新建 → 刷新结构树 → 等入库可读 → 跳详情页」收敛成一份实现，顶栏新建与结构树内联新建共用（此前只有顶栏加了等待）。附带发现：`FileTree` 的内联新建是不可达的死代码（`startCreate` 从未被调用），统一它只为不留第二份实现。
> ④ **仓库布局**：`Dockerfile` / `entrypoint.sh` / `docker-compose.prod.yml` 移入 `deploy/`，构建命令改为 `docker build -f deploy/Dockerfile .`（见 §1）。根目录只剩 8 个已跟踪文件，且每个都被具体工具链直接读取。
> ⑤ 验证：`pnpm typecheck` EXIT=0；本地 `delete-open-note-probe` 7/7、`errorpage-and-treecreate-probe` 9/9；生产端到端 9/9（错误页文案与三个按钮、结构树里删除正在查看的笔记后回到列表、该笔记接口确为 404）；`pnpm acceptance:prod` 19/19。

> **v1.9.8 无 schema 变更**，启动日志为 `No pending migrations to apply.`，与 v1.9.7 双向回滚都不丢数据。本次修掉「新建的笔记打不开、页面一片空白」：
> ① **根因：题名被 YAML 解析成非字符串** —— 新建模板写的是 `title: 111`（无引号），YAML 把 `111` 解析成 int（`true` / `2026-10-06` / `1.5` 同理）；`processMarkdownFile` 把这个值透传给 Prisma 时抛 `Argument \`title\`: Invalid value provided. Expected String, provided Int.`，**整篇入库失败且不重试** → DB 里永远没有这一行 → 结构树（按文件系统构建）里看得见、点开 `/api/notes/<slug>` 却是 404 → 详情页 `throw createError` → 一片空白（线上真实案例：标题「111」的笔记，创建于 v1.9.7 上线后 3 分钟）。
> ② **修复**：`server/utils/vault.ts` 新增 `normalizeNoteTitle`（题名统一归一为字符串，Date 取日期部分）与 `yamlTitleScalar`（会被解析成 int/bool/日期的题名写 frontmatter 时加引号），`noteTemplate` 采用；`server/utils/markdown.ts` 的题名派生改为 `normalizeNoteTitle(frontmatter.title, slug)`。
> ③ **自愈：watcher 新增对账** —— 启动时 + 每 5 分钟一次，把「磁盘有、DB 没有」的文件补入库（**只补不删**，避免 vault 挂载异常时清库）。生产用 `ignoreInitial: true`（重启不重同步，免得把 `updatedAt` 刷成当天），此前这类文件会永久缺席 DB。**本次上线启动日志实测**：`[garden] watcher: 对账发现 1 篇笔记未入库，开始补入库` → `[garden] watcher: 对账补入库成功 ltl/个人开发规范/111`，那篇打不开的笔记随即恢复；本地另用「删掉 DB 行再等 5 分钟」验证了周期对账同样生效。
> ④ 验证：`pnpm typecheck` EXIT=0；`numeric-title-probe` 15/15（`111`/`true`/`2026-10-06`/`1.5` 四类标题新建后立即可读、磁盘 frontmatter 已引号包裹、直接写盘的同类文件也能经 watcher 入库）；生产端到端 9/9（「111」详情页有标题与「编辑」入口、可进编辑态、新建数字标题笔记立即可读）；`pnpm acceptance:prod` 19/19。

> **v1.9.7 无 schema 变更**（只改服务端写文件/入库路径与前端组件），启动日志为 `No pending migrations to apply.`，与 v1.9.6 双向回滚都不丢数据。本次修掉五处问题：
> ① **新建笔记正文空白** —— `ArticleReader` 的「去掉与标题重复的首个标题」原先无条件删除，而新建模板产出的唯一内容就是这个标题，正文区因此被清空；改为「确实还有其它内容时才移除」。
> ② **新建后跳详情页被 404 中止**（地址栏已是新笔记、页面却停在列表页且永不恢复）—— 新建接口只写文件、入库交给 watcher，实测 `GET /api/notes/<slug>` 有 1–1.5 秒 404 窗口（t=48/343/836ms 返回 404，1513ms 才 200）；改为新建接口自己 `processMarkdownFile` 主动入库，前端再加有界等待兜底。
> ③ **重命名只改文件名、不改题名** —— 显示名派生自 `frontmatter.title || 文件名`（`server/utils/markdown.ts`），而重命名只改磁盘文件名与 `DB.slug`，于是详情页文章头/笔记列表/图谱/选择器全部继续显示旧名。新增 `server/utils/vault.ts` 的 `rewriteNoteTitle`（同步 frontmatter `title:` 与正文首个标题，且**只在确认写的就是旧题名时才动**，绝不顶替用户的章节小标题）；题名与文件名相同时自动同步，人工题名时由重命名对话框询问；文件夹改名不动子笔记标题。
> ④ **编辑保存 60 秒内不生效**（本轮修复过程中发现并修掉）—— `isRecentlyIngested` 原为 60s TTL 且命中不消费，watcher 命中即 `return` 不补发，导致刚被新建/改名处理过的文件在这 60 秒内的真实改动被永久忽略；改为命中即消费，并从新建/改名路径移除该标记（只保留批量导入使用）。
> ⑤ **删除笔记/文件夹后 DB 行残留（孤儿行）** —— 删除只删文件，清行依赖 watcher 的 `unlink`，而 chokidar 的 `awaitWriteFinish(1000ms)` 会让「稳定窗口内就被删掉」的文件从未被登记、不产生 unlink（实测 3 轮里 2 轮残留，列表/搜索/图谱继续挂着、点开 404）；删除接口现在主动清行（`removeMarkdownFile` / `prisma.note.deleteMany`，幂等，watcher 稍后再删一次无害）。

> **v1.9.1 无 schema 变更**（多选器只加了 `/api/notes` 的查询参数与响应字段 `hasPending`，以及前端组件），启动日志为 `No pending migrations to apply.`，与 v1.9.0 双向回滚都不丢数据。
> 两点值得记下的教训：①把组件插进 `v-if` 的 `</template>` 与 `v-else` 之间会让 Vue 编译期报「v-else/v-else-if has no adjacent v-if or v-else-if」→ **`/admin` 整页 500，而 `nuxt typecheck` 照样通过**；②审核面板的 `onlyIds` 忘了从布局传下去，导致「对指定笔记重新判定」后面板展示全库待审。两者都只有**真正加载页面**才能发现，所以 `acceptance:picker` 的 U0/U14 就是钉住这两条的断言。

---

## 1. 本地构建镜像

```bash
# 仓库根目录（Dockerfile 在 deploy/，构建上下文仍是仓库根）
docker build --progress=plain -f deploy/Dockerfile -t my-digital-garden-app:v1.1.0 -t my-digital-garden-app:latest .
```

`deploy/Dockerfile` 为多阶段构建（`node:24-alpine`）：

- **build 阶段**：先只 COPY `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `prisma/` / `prisma.config.ts` → `pnpm install --frozen-lockfile` → 用占位 `DATABASE_URL` 跑 `prisma generate`（仅为让 schema 类型可用）→ 再 `COPY . .` → `pnpm build`。分层顺序是为了让依赖层吃缓存。
- **runtime 阶段**：`pnpm install --frozen-lockfile --prod` → `COPY --from=build /app/.output` + `scripts/` + `deploy/entrypoint.sh`，`EXPOSE 3000`，`CMD ["./entrypoint.sh"]`。
- 注意：Docker 的 `COPY` 路径始终相对于**构建上下文**（仓库根），所以 Dockerfile 移进 `deploy/` 之后，其中写的是 `COPY deploy/entrypoint.sh ./`；`docker build` 必须带 `-f deploy/Dockerfile`。

`.dockerignore` 已排除 `node_modules`/`.nuxt`/`.output`/`.env.*`/`content`/`.git`/`*.md` 等，构建上下文很小。

---

## 2. 导出并上传镜像

```bash
docker save -o garden-image-v1.1.0.tar \
  my-digital-garden-app:v1.1.0 my-digital-garden-app:latest

# 两端核对完整性
Get-FileHash garden-image-v1.1.0.tar -Algorithm SHA256      # Windows
sha256sum garden-image-v1.1.0.tar                            # Linux

scp -i ~/.ssh/garden.pem garden-image-v1.1.0.tar root@8.163.35.246:/opt/garden-image-new.tar
```

### ⚠️ 打包陷阱：不要把 tar 再包一层

```bash
# ❌ 错误：tar 里只有「一个普通文件」，docker load 必然失败
tar -czf garden-image-v1.1.0.tar.gz garden-image-v1.1.0.tar
```

这样产生的 `.tar.gz` 解压后只含一个名为 `garden-image-v1.1.0.tar` 的普通文件，`docker load` 会报：

```
open /var/lib/docker/tmp/docker-import-<id>/repositories: no such file or directory
```

**正确做法：直接上传裸 `.tar`，不要 gzip。** Docker Desktop 的镜像层本身就是压缩存储的，`gzip` 几乎无收益（实测 301,535,744 B → 300,608,949 B，仅省 0.3%）。若确需压缩，必须压**内容**而不是压文件本身。

### 镜像格式说明

本机 Docker Desktop 29.x 使用 **containerd snapshotter**，`docker save` 产出的是 **OCI layout** 归档（`blobs/`、`oci-layout`、`index.json`），同时附带一份兼容用的 `manifest.json`（`repositories` 文件不存在）。

实测 **Docker Engine 24.0.9 可以直接 `docker load` 该归档**，无需转换。载入后 classic store 计算出的 ImageID 与本地 containerd store 显示的不同（本地 `3e419e63d94e` → 服务器 `1c983fe652b1`），**这是正常的**，以容器实际运行为准。

---

## 3. 服务器载入镜像（不影响运行中的容器）

```bash
ssh -i ~/.ssh/garden.pem root@8.163.35.246

STAMP=$(date +%Y%m%d-%H%M%S); BK=/opt/garden-backup; mkdir -p "$BK"
cp -a /opt/garden-docker/docker-compose.prod.yml "$BK/docker-compose.prod.yml.$STAMP"
cp -a /opt/garden-docker/.env "$BK/env.$STAMP"; chmod 600 "$BK"/env.*

# v2.0.0 起：编排里多了 /opt/digital-garden/data 挂载（备份与审计报告落盘）。
# 首次升级到 v2.0.0 时先把服务器上的编排换成仓库这份，并建好目录（已有备份则跳过 cp）。
mkdir -p /opt/digital-garden/data
scp -i ~/.ssh/garden.pem deploy/docker-compose.prod.yml root@8.163.35.246:/opt/garden-docker/docker-compose.prod.yml.new
# 在服务器上：sed -i 's/\r$//' …new && mv …new …prod.yml

# 记录回滚点
docker inspect garden-app --format '{{.Image}}' | tee "$BK/rollback-image-id.$STAMP.txt"
docker image inspect my-digital-garden-app:v1.0.0 --format 'v1.0.0={{.Id}}'

docker load -i /opt/garden-image-new.tar
docker images | head -8     # 确认 :v1.1.0 / :latest 指向新 ID，且 :v1.0.0 仍在
```

`docker load` 会把旧的 `:latest` tag 挪成 dangling（`<none>`），**旧的 `:vX.Y.Z` tag 仍然保留**——这就是回滚点，务必确认它还在。

---

## 4. 重建容器

```bash
cd /opt/garden-docker
docker compose -f docker-compose.prod.yml up -d --force-recreate

# 等就绪（entrypoint 先跑迁移，最多重试 10 次 × 5s）
until [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login)" = "200" ]; do sleep 2; done

docker ps --filter name=garden-app
docker logs --tail 30 garden-app
```

容器启动日志应包含：

```
[garden] 等待数据库就绪...
No pending migrations to apply.
[garden] 迁移完成，启动应用...
[garden] watcher: 开始监听 /app/content/vault
Listening on http://[::]:3000
```

`entrypoint.sh` 的流程是：`npx prisma migrate deploy`（最多 10 次、每次 sleep 5）→ `exec node scripts/start-prod.mjs`。

### 4.1 用脚本一次做完 §3–§4（推荐）

仓库里的 `scripts/deploy/deploy-image.sh` 把「备份编排与 .env → 记回滚点 → load → 重建 → 轮询就绪 → 打印状态与资源」串成一步，版本无关、可重复执行：

```bash
# 本地：导出并上传（注意是**裸 tar**，不要 tar 套 tar，见 §2）
docker save -o garden-image-v1.9.1.tar my-digital-garden-app:v1.9.1 my-digital-garden-app:latest
scp -i ~/.ssh/garden.pem garden-image-v1.9.1.tar root@8.163.35.246:/opt/garden-image-v1.9.1.tar
scp -i ~/.ssh/garden.pem scripts/deploy/deploy-image.sh root@8.163.35.246:/opt/deploy-image.sh

# 服务器
ssh -i ~/.ssh/garden.pem root@8.163.35.246
sha256sum /opt/garden-image-v1.9.1.tar          # 与本地 Get-FileHash 比对
bash /opt/deploy-image.sh v1.9.1
```

> ⚠️ `deploy-image.sh` 里带 `set -e`：任一步失败即中止（不会留下半完成的容器状态）。回滚见 §6。

---

## 5. 部署后验证

### 5.1 端点与容器

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login          # 200
curl -s -o /dev/null -w '%{http_code}\n' https://liutianle.cn/login            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://liutianle.cn/                 # 302（未登录跳转，正常）
curl -s -o /dev/null -w '%{http_code}\n' https://liutianle.cn/api/overview    # 401（未登录，正常）
docker inspect garden-app --format 'Image={{.Image}} Started={{.State.StartedAt}} Mem={{.HostConfig.Memory}}'
free -m
```

### 5.2 新代码确实生效

```bash
# 服务端产物含新端点与字段（输出 ≥1 即生效）
docker exec garden-app sh -c "ls /app/.output/server/chunks/routes/api/ | grep -c overview"
docker exec garden-app sh -c "grep -o 'sections' /app/.output/server/chunks/routes/api/overview.get.mjs | wc -l"
# 客户端产物含新页面 testid（分类浏览页）
docker exec garden-app sh -c "grep -rl '分类浏览' /app/.output/public/_nuxt/ | head -1"
```

### 5.3 登录后只读校验接口形状

登录用 root 密钥（`POST /api/auth/verify`，body `{"key":"..."}`，成功下发 `garden_token` cookie），然后 `GET /api/overview` 应返回：

- `total` / `links` / `isolated` 三个整数（`links` 只统计两端都已发布的 `NoteLink`）
- `sections[]` 每项含 `key`（slug 前两段）、`label`（末段）、`count`
- `types[]` 每项含 `key`（`type/*` 后的类型名或 `未分类`）、`label`、`count`
- `maturity[]` 每项含 `key`（`SEEDLING` / `GROWING` / `EVERGREEN`）、`label`、`count`

再抽查分类筛选：`GET /api/notes?pageSize=2&type=教程`、`GET /api/notes?dir=ltl/01-编程语言`、`GET /api/notes?maturity=EVERGREEN` 均应返回 `total > 0`。

### 5.4 只读验收套件（推荐）

```bash
# Windows PowerShell
$env:GARDEN_BASE='https://liutianle.cn'
pnpm acceptance:prod      # 只读部署校验 19 项：新端点存在 + 字段形状 + 权限仍生效（**全程只发 GET**）
pnpm acceptance:shell     # 外壳 47 项，只开对话框不提交
pnpm acceptance:ui        # UI 51 项，只开对话框不提交
```

> 🚫 **`pnpm acceptance:api`（`e4-regression.mjs`）与 `pnpm acceptance:suggest`（`suggest-verify.mjs`）绝不能对生产跑**：
> 前者会 POST `/api/admin/keys`、POST `/api/vault/folders`、POST `/api/vault/notes`、PUT `/api/vault/rename`、POST `/api/vault/copy`，并 DELETE `/api/vault/nodes`（含 `KnowledgeBase/03_Knowledge`）；
> 后者同样会建/删临时密钥与测试笔记，还会**改写笔记的 frontmatter**（标签写回）并临时建/删知识区领域目录 —— **都会真实改动生产数据**。
> 生产上线后要断言新功能，用 `pnpm acceptance:prod`（只读）。

---

## 6. 回滚

```bash
cd /opt/garden-docker
docker tag my-digital-garden-app:v1.3.0 my-digital-garden-app:latest   # 回退一格；再退一格用 v1.2.0
docker compose -f docker-compose.prod.yml up -d --force-recreate
until [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login)" = "200" ]; do sleep 2; done
```

配置回滚：从 `/opt/garden-backup` 恢复对应时间戳的 `docker-compose.prod.yml` 与 `env.*`。

> 数据库迁移**不会**自动回滚。因此每次上线前都应确认本轮是否新增迁移；若有，需预先想好对应的降级 SQL。
> v1.4.0 的 `GraphColor` 表是**纯新增**，降级 SQL 为 `DROP TABLE "GraphColor";`——但通常不必执行：旧版本只是不读这张表，留着无害（重新升到 v1.4.0 时反而能保住用户已选的颜色）。

---

## 7. 运维速查

| 操作 | 命令 |
|---|---|
| 查看容器 | `docker ps --filter name=garden-app` |
| 查看日志 | `docker logs --tail 50 garden-app` |
| 跟随日志 | `docker logs -f garden-app` |
| 重启应用 | `cd /opt/garden-docker && docker compose -f docker-compose.prod.yml restart` |
| 重建应用 | `cd /opt/garden-docker && docker compose -f docker-compose.prod.yml up -d --force-recreate` |
| 资源占用 | `docker stats --no-stream garden-app`；`free -m` |
| 进容器排查 | `docker exec -it garden-app sh` |
| 重启 Nginx | `systemctl reload nginx` |
| 数据库连接 | `sudo -u postgres psql -d garden_db` |
| 清理悬空镜像 | `docker image prune -f` |
| 证书续期 | acme.sh 自动（`/root/.acme.sh/liutianle.cn_ecc`） |

**上线新版本的标准流程**：§1 构建 → §2 导出上传 → §3 载入 → §4 重建 → §5 验证；任一环节失败走 §6 回滚。

---

## 8. 已知平台限制与踩坑（实测记录）

1. **`tar` 套 `tar` 会让 `docker load` 失败**（报 `.../repositories: no such file or directory`）。见 §2，直接上传裸 `.tar`。
2. **Windows 写出的 `.sh` 经 `ssh "bash -s"` 执行会带 CRLF**，报 `bash: line N: $'\r': command not found`。发送前先剥掉 `\r`，或改用 `scp` 上传 LF 文件后再执行。
3. **PowerShell 会吃掉传给 `ssh` 的内层双引号**，导致 bash 把 `|` 当管道（`bash: line 1: {{.Image}}: command not found`）。远程命令尽量只用单引号，或避免嵌套引号。
4. **`docker save` 的 ImageID 与载入后的不一致**：本机 containerd store 与服务器 classic overlay2 store 计算方式不同，属正常现象。
5. **Windows 本地直接运行 `.output`**：Nitro 打包将 `import.meta.url` 替换为占位 `file:///_entry.js`，Prisma 7 客户端生成的 `__dirname` shim 在 Windows 上调用 `fileURLToPath` 会抛 `ERR_INVALID_FILE_URL_PATH`。故统一经 `scripts/start-prod.mjs` 包装器启动（`entrypoint.sh` 已采用）。
6. **pnpm 符号链接跨平台断裂**：Windows 构建的 `.output/server/node_modules` 使用 pnpm 链接结构，**裸 `.output` 搬到 Linux 会依赖解析失败**（如 `postgres-array` 缺失）。Docker 镜像内是在 Linux 容器中构建的，因此**搬运镜像安全**，搬运裸 `.output` 不安全。
7. **内存红线**：1.6G 内存曾被 watcher 全量重算吃满拖死整机（2026-09-22），故容器限 640M / Node 堆 384M。若发现容器被 OOM Kill，先查 watcher 是否在扫大目录。
8. **本机与服务器架构需一致**：本机为 `linux/amd64`，与服务器一致，镜像可直接 load。
9. 生产环境建议 Node ≥ 20.19（Nuxt 4 要求）；当前镜像为 `node:24-alpine`。
10. **`docker load` 只恢复归档里内置的 tag，不会移动 `latest`**：若 `docker save` 时只写了 `my-digital-garden-app:v2.0.5`，载入后 `:v2.0.5` 指向新 ImageID，而 `:latest` 仍指着旧镜像；`docker compose up -d` 用的是 `image: my-digital-garden-app:latest`，于是容器**跑的还是旧版本**（v2.0.5 首次上线就踩了这个坑：容器重建成功、登录 200、但 CSS 仍旧、页面照旧显示反引号）。载入后必须显式 `docker tag my-digital-garden-app:vX.Y.Z my-digital-garden-app:latest`，再用 `docker inspect -f '{{.Image}}' garden-app` 核对 ImageID 与 `docker images` 里该 tag 的 ID 一致。
11. **`docker save` 后务必对两个 tag 一起导出**（`docker save ...:vX ...:latest`）或在载入后补 tag，可省掉上面那次核对。

---

## 9. 已退役的 PM2 路径（仅作历史参考）

线上早期使用 PM2 cluster + 原生 PG + Syncthing + certbot，相关痕迹：

- `/opt/digital-garden`：PM2 时代源码与 `.output`。**其 `content/vault` 仍被当前容器 bind mount**，不可删除。
- `/root/.pm2/dump.pm2`：历史 dump（PM2 当前未运行，探针里的 `pm2 list` 会意外拉起 God Daemon，用完请 `pm2 kill`）。
- `ecosystem.config.cjs`、`docker-compose.yml`（postgres + syncthing 基础编排）、`docker-compose.local.yml`（本机演示）、`nginx.conf`（服务器实际配置的副本）**已于 2026-10-06 从仓库移除**（线上均未使用；需要查阅时用 `git show <删除前的提交>:<路径>` 从历史取回）。
- `/opt/garden-src`：2026-09-24 在服务器上用 `docker build` 产出 v1.0.0 的源码树，现已弃用（服务器内存不足以再构建）。
