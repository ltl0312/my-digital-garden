# 拾光 · 数字花园 — 项目优化执行计划书

> 依据：`design-spec.html`（设计方案 v6，12 章）与项目现状（2026-09-20）逐项比对后编制。
> 文档方案与判定标准**可直接执行**；差异点见第 2 节，均已在本计划中补齐。

---

## 1. 优化目标与范围

**目标**：把 design-spec 中已设计、已验证的六轮方案（视觉重设计 / 权限体系 / 文件树操作 / 批量导入 / 成熟度治理）落地到现有 Nuxt 4 代码库，全程不破坏既有功能。

**范围**（对应文档章节）：

| 范围 | 文档章节 | 现状 |
|---|---|---|
| DAWN 设计语言替换（令牌 / 外壳 / 页面 / 组件） | 3、4、5、6、7 | 现有 Tailwind + 143 行 main.css，未动 |
| 三级角色权限体系（root/admin/user） | 8.1–8.5 | AccessKey.role 仅 `"admin" \| "user"`，无 root/createdBy/isBuiltin |
| 文件树右键操作（重命名/新建/删除/复制/粘贴） | 8.6、8.8、8.9 | 后端仅有笔记级新建/保存/删除 |
| 新建文件夹 | 8.6、8.7 | 无 folders 接口 |
| 批量导入（5MB/100MB 限制） | 9 | 无导入接口；nginx 无 client_max_body_size（默认 1MB） |
| 成熟度治理 | 10 | markdown.ts 缺省回退 SEEDLING；模板无 maturity 行 |

**明确不在本轮范围**：数据批量 `--apply` 之外的 vault 内容改写；部署运维（nginx 改动只交付配置行，上线由部署流程执行）。

---

## 2. 文档与现状的差异清单（审阅结论）

文档**总体完整**：设计令牌、组件规范、权限矩阵、判定标准、前后对照截图齐备，可执行。以下 7 处差异需在实施时修正：

| # | 类型 | 差异 | 处置 |
|---|---|---|---|
| D1 | **缺失** | 8.8 定义了六项右键操作，但落地清单只有 `POST /api/vault/folders`；现有后端只有笔记级新建/保存/删除。**文件夹改名/删除、复制、粘贴的接口没有设计** | 阶段 C 补齐接口设计并实现 |
| D2 | **缺失** | 11 章验收清单缺右键操作（六项 × 三角色）、文件夹创建、成熟度数据正确性三项验收 | 已并入第 5 节验证矩阵 |
| D3 | **过时** | 11 章 ① 称"替换 main.css 的 Lumina/护眼变量"——现状 main.css 仅 143 行、以 Tailwind 为主，该描述来自旧概念稿 | 阶段 E 以现状文件为准 |
| D4 | **顺序风险** | 11 章"先样式后权限后导入"：权限/导入的新组件先用旧样式实现、再随视觉重写返工一遍 | 调整为「数据与行为先行，视觉统一收尾」（见第 3 节） |
| D5 | 确认项 | AccessKey.role 为无约束 String（建议应用层白名单校验 + 迁移期数据核对）；nginx、watcher、markdown.ts 现状与文档描述一致 | 已在各阶段落地 |
| D6 | **新增执行项** | 线上 12 篇 type/MOC 标签残留（frontmatter 已删、NoteTag 未清），文档只警示未列执行项 | 阶段 A4：watcher 标签同步做"减法" |
| D7 | 细化 | 10.7 判定函数 TS 移植的反链查询依赖 DB 时序（Note 先入库才能查 NoteLink） | 阶段 A5 明确：判定置于链接解析之后 |

---

## 3. 实施步骤与执行顺序

原则：**每阶段独立可验证、可回滚；数据与行为先行，视觉收尾**（修正 D4）。

### 阶段 A — 数据与成熟度（低风险，先行）
| 步骤 | 模块 | 产出 | 验证 |
|---|---|---|---|
| A1 批量写入成熟度 | `content/vault`（245 篇 frontmatter） | `maturity:` 字段落盘，自动备份于 `.maturity-backup/<ts>/` | audit 重跑幂等（0 写入）；抽查 frontmatter；git diff 可审 |
| A2 模板补 maturity 行 | `05_Templates/*.md`（3 个） | 新笔记从出生带显式成熟度 | 模板文件 head 检查 |
| A3 生成规范同步 | `KnowledgeBase/.claude/commands/inbox.md` | 生成契约加入 maturity 初始值说明 | 文档段落检查 |
| A4 标签同步"减法" | `server/utils/markdown.ts`（NoteTag 对账） | 同步时删除 frontmatter 已不存在的关联，消除 12 篇残留类问题 | 造 1 篇删标签的笔记 → 同步后 DB 关联消失 |
| A5 判定函数移植 | `server/utils/maturity.ts`（新） | TS 版契约完成度判定（五区块/关联填充/跨学科溯源；反链查 NoteLink，置于链接入库后） | 与 `maturity-audit.py` 对 287 篇结果对账，不一致 = 0 |
| A6 markdown.ts 缺省改造 | `server/utils/markdown.ts:112` | `|| 'SEEDLING'` → 调用判定函数；非法值告警 | 单元对账 + watcher 全量重同步后 `GROUP BY maturity` 分布与 audit 一致 |

### 阶段 B — 三级角色权限（中风险，涉及迁移）
| 步骤 | 模块 | 产出 | 验证 |
|---|---|---|---|
| B1 数据迁移 | `prisma/schema.prisma` + migration | role 注释扩为 root/admin/user；新增 `createdBy`、`isBuiltin` | `prisma migrate dev` 成功；存量数据核对（现有 admin 种子标记 isBuiltin） |
| B2 二维校验 | `server/utils/auth.ts` + `server/api/admin/keys/*` | 新增 `canToggle/canDelete/canCreate(targetRole)`；管理接口逐条接入；root 保护位（服务端 403） | 越权矩阵 12 条逐条 curl（见第 5 节） |
| B3 前端管理页 | `pages/admin.vue` → 拆「我的密钥」+「密钥管理」；`layouts/default.vue` 角色化可见性 | 原型 ROLES/canToggleKey/canDeleteKey 移植为 composable | 浏览器三身份切换对照 |

### 阶段 C — 文件树操作后端（补 D1 缺口）
| 步骤 | 模块 | 产出 | 验证 |
|---|---|---|---|
| C1 文件夹接口 | `server/api/vault/folders.post.ts` | 新建文件夹（复用 resolveVaultPath 防穿越） | 深层/根目录/重名/越权用例 |
| C2 重命名 | `server/api/vault/rename.put.ts` | 文件与文件夹改名（同步更新 Note.slug、NoteLink 端点、目录折叠路径） | 改名后详情/反链/树一致性 |
| C3 复制粘贴 | `server/api/vault/copy.post.ts` | 深拷贝文件/文件夹，粘贴重名校验（文件名不可重复） | 同目录粘贴被 400 拒绝 |
| C4 权限矩阵 | 上述接口接入阶段 B 校验 | 非空文件夹删除仅 root；结构目录全员禁改 | 矩阵逐条 curl |

### 阶段 D — 批量导入（最大单项）
| 步骤 | 模块 | 产出 | 验证 |
|---|---|---|---|
| D1 常量共享 | `server/utils/import-limits.ts` | 5MB/100MB/500 个/白名单，前后端同源 | — |
| D2 三接口 | `import/preflight|file|finish.post.ts` | 先校验后上传；jobId 记账；真实字节数复核；原子写 | 6.2MB 单文件 413 / 104MB 文件夹 400 / 路径穿越 400 |
| D3 前端 | `composables/useImport.ts` + `components/ImportDialog.vue` + 顶栏「新建」下拉 | 纯函数预检（原型 impValidate 移植） | 真实文件上传用例 |
| D4 watcher 配合 | `server/plugins/watcher.ts` | 导入完成后对本次文件列表主动并发入库 | 300 文件 < 30s 可搜索（文档 9.6 验收 ⑥） |
| D5 nginx | `nginx.conf` | `client_max_body_size 8m;` | 部署时 5MB 文件不再 413 |

### 阶段 E — 前端 DAWN 视觉重写（统一收尾，避免返工）
| 步骤 | 模块 | 产出 | 验证 |
|---|---|---|---|
| E1 令牌层 | `main.css` 重写 + `tailwind.config.js` 色阶映射 | DAWN 变量（亮/暗双模式）+ FOUC 保持 | 主题切换无闪烁 |
| E2 外壳 | `layouts/default.vue` 三段式 + RailNav + 分段侧栏 | 取数/持久化逻辑原样保留 | 全页面可达 |
| E3 页面与组件 | NoteRow / TocRail / Dialog / Toast / 角色化 admin / ImportDialog 换肤 | class 迁移，函数体不动 | 前后截图对照（spec 第 5 章） |
| E4 移动端 | 断点规则 | 390px 正文 ≥ 350px | 四档视口无横向滚动 |

### 阶段 F — 收口
- 全量回归（第 5 节矩阵）+ `pnpm typecheck` + 构建产物部署核对。
- 更新 README / 部署文档（nginx 行、迁移步骤、audit 工具用法）。

---

## 4. 风险与应对

| 风险 | 等级 | 应对 |
|---|---|---|
| A1 批量写 vault（245 文件）误伤 | 低 | 工具已验证（幂等/备份/locked）；git diff 可审；备份目录可整目录回滚 |
| B1 迁移影响线上数据 | 中 | 迁移前 `pg_dump`；role 扩展为加列不删数据，可回退 migration |
| watcher 同步减法（A4）误删有效关联 | 中 | 减法只对"该笔记本次解析出的标签集合"做差，且先 dry-run 统计删除量再启用 |
| C2 改名牵连 slug/反链/树状态 | 中 | 服务端事务内同步更新 Note/NoteLink；前端折叠路径映射沿用原型 reslugAll 思路 |
| D2 导入中断残留半包 | 中 | jobId 超时清理 + finish 前文件不入库（先落 .import-tmp 再原子 rename） |
| E 阶段视觉重写量大（前端共 1184 行） | 中 | 按页面分 4 个 PR 粒度提交，每步浏览器前后对照截图；业务函数体零改动为硬约束 |
| 各阶段与用户手改冲突 | 低 | 每阶段独立分支 + 阶段开始时 rebase；阶段完成打 tag |

---

## 5. 验证矩阵（补齐 D2 后的完整清单）

1. **构建**：`pnpm typecheck` 通过；`pnpm build` 产物完整。
2. **视口**：390 / 768 / 1024 / 1512 四档无横向滚动；390px 正文 ≥ 350px。
3. **主题**：亮暗切换无闪烁。
4. **既有功能**：分页、筛选、编辑、删除、图谱状态持久化、密钥管理行为与改版前一致。
5. **权限矩阵**（B）：普通管理员禁用自己 → 403；任何身份删/禁初始管理员 → 403；普通用户访问管理接口 → 403；普通管理员建管理员 → 403；root 不可见"创建初始管理员"。
6. **文件操作**（C）：六项操作 × 三角色 = 18 条用例全过；重名一律拒绝；结构目录全员不可改。
7. **导入**（D）：6.2MB 单文件 413；104MB 文件夹预检 400 且零上传流量；合规 8.6MB 成功；`../../` 路径 400；普通用户 403；300 文件 < 30s 入库。
8. **成熟度**（A）：audit 与 TS 判定对 287 篇对账 0 差异；删标签同步后 DB 残留 = 0；新笔记 frontmatter 带 maturity。
9. **每阶段**：阶段验证通过并汇报后，才进入下一阶段（沿用 fix → harden → optimize → publish 节奏）。

---

## 6. 当前进度（2026-09-20）

- [x] 计划书编制（本文档）
- [x] A1 批量写入成熟度：245 篇落盘（23 常青 / 137 成长 / 85 幼苗；INDEXED 与排除项不写），备份于 `content/vault/.maturity-backup/20260920-214550/`；幂等验证 0 重复写入；git 变更恰好 245 文件
- [x] A2 模板补 maturity 行：05_Templates 3 个模板已插入
- [x] A3 生成规范同步：inbox.md 4 个 frontmatter 模板块已插入
- [x] A4 标签对账清理：`scripts/reconcile-tags.ts`（dry-run 默认 / --apply）。本地 DB dry-run = **0 残留**（本地曾全量同步）；线上 12 篇 type/MOC 残留源于未重同步，部署环境执行本脚本即可消除
- [x] A5 判定函数 TS 移植：`server/utils/maturity.ts`（纯函数零依赖）+ `scripts/verify-maturity.ts` 对账 **287 篇 0 差异**（23/137/77/44/6）。对账抓到并修复两处缺陷：audit 的 tags 解析漏行内数组（INDEXED 36→44）；TS 版 ctxFilled 正则跨行贪婪（23 篇常青掉档）
- [x] A6 markdown.ts 缺省改造：显式人工值尊重 / 非法值告警走判定 / 缺省自动判定；`server/utils/maturity-sync.ts` 编排（单篇 DB 口径 + 全量双口径重算）；watcher dev 就绪后自动重算；`POST /api/admin/maturity/recompute`（生产季度复核）。**真实链路验证**：本地 DB 重算扫描 287 · 更新 160 · 分布 SEEDLING=127（77 幼苗+44 索引载体+6 排除载体）· GROWING=137 · EVERGREEN=23，与判定完全吻合
- [x] **验证基建修复**：本地 node_modules 曾因 pnpm v12 默认 linker 在此 Windows 环境产出断链 junction 而残废（nuxt.mjs 等顶层链接缺失/空目录）。改用 `pnpm-workspace.yaml` 的 `nodeLinker: hoisted`（pnpm v12 已不读 .npmrc 的该配置）完整重建（675 顶层条目）；补装 typescript@5.9.3 + vue-tsc（typecheck script 此前从未可运行）；新增代码 tsc --strict 零错误（修复 3 处类型收窄 + 2 处路径/select 错误）
- [ ] vue-tsc 全项目跑通（vue-tsc 包复制不完整——pnpm 文件系统层与 Defender 疑似干扰，待观察；新增代码已用 tsc 严格模式单独验证）
- [x] **B1 数据迁移**（2026-09-21）：`AccessKey` 新增 `createdBy`/`isBuiltin`；迁移前 pg_dump 备份（`.workbuddy/backups/digital_garden_pre_phaseB_20260921-093928.dump`）；迁移 SQL 将存量「初始管理员」订正为 `role='root', isBuiltin=true`（spec 8.1 root 为独立 role 值）。修复迁移期两个环境问题：valibot 包残缺（npmmirror tarball 覆盖修复）；trgm 原始 SQL 索引被 Prisma diff 判为漂移（已从迁移 SQL 剔除 DROP，**后续 `migrate dev` 出现同名提示一律拒绝，部署走 `migrate deploy`**）
- [x] **B2 服务端二维校验**（2026-09-21）：`server/utils/auth.ts` 新增 `canCreate/canToggle/canDelete` 纯函数（返回 `{ok, why}`，文案对齐 spec 8.5）+ `requireAdmin` 放行 root；4 个 keys 接口逐条接入（可见范围下沉到 where：root 全量 / admin 自己+user / user 仅自己；他人密钥打码返回）；越权矩阵 13 条 curl 全部 403 且文案正确，合法路径（root 建 admin、admin 建 user、root 删测试密钥）回归通过
- [x] **B3 前端管理页**（2026-09-21）：`app/composables/useRoles.ts`（原型 ROLES/canToggleKey/canDeleteKey 移植）+ `pages/admin.vue` 三形态（root 全量 / admin 收窄+顶部说明 / user 无权限页+两出口）+「我的密钥」身份卡（打码+复制+创建者+权限边界清单）；`layouts/default.vue` 经 `useAuth`（admin\|root）控制入口可见性；`auth.global.ts` 移除 /admin 角色重定向（spec 8.3 user 直达无权限页）；浏览器三身份 19 项断言 18 PASS + 1 处断言预期修正（root 行防自锁文案优先于保护位文案，截图核对确认）；新增/改动 TS `tsc --noEmit --strict` 0 错误（修复 readBody 返回值 undefined 两处）
- [x] **C1 新建文件夹**（2026-09-21）：`server/api/vault/folders.post.ts` + `server/utils/vault.ts` 共享工具（`isValidNodeName` / `normalizeVaultRel` / `isStructuralPath` / `isDirEffectivelyEmpty`）。验证：user 403；深层/根目录建目录 200；重名 409；非法名 400；父目录不存在 404；结构目录内建目录 200（增内容允许）
- [x] **C2 重命名**（2026-09-21）：`server/api/vault/rename.put.ts`。文件/文件夹改名；同目录重名 409；结构目录对 admin 与 root 均 403；目录改名在单事务内做**全部子孙 `Note.slug` 前缀替换**（NoteLink 引用 Note.id，无需触碰反链）。验证：新路径详情 200 / 旧路径 404 / 旧 slug 404；深层普通目录（结构目录内）可改名 200。**Windows 专项**：watcher 持有目录句柄导致 `fs.rename` 持续 EPERM，实现「退避重试 3 次 → 降级复制+删除」兜底后通过
- [x] **C3 复制 / 粘贴**（2026-09-21）：`server/api/vault/copy.post.ts`。深拷贝文件 / 递归复制文件夹（跳过 dotfile）；同名一律 409（同目录粘贴因此被拦）；粘贴到自身或子目录 400；副本由 watcher 幂等入库。验证：user 403；同目录粘贴 409；自粘贴 400；跨目录复制文件 200；整目录复制 200 + 副本笔记入库
- [x] **C4 删除节点 + 权限矩阵**（2026-09-21）：`server/api/vault/nodes/index.delete.ts`。文件直删（支持树内无扩展名 slug）；空目录 admin 可删；**非空目录仅 root**（返回将连带删除的篇数，供前端二次确认）；结构目录全员禁改（含 root）；user 403（requireAdmin）。验证：50/51/52/53/54/55/56/57 全 PASS（403 文案分别为「普通用户无管理权限」「非空文件夹仅初始管理员可删除」「结构目录受保护」），删除后 watcher 清库、DB 零残留
- [x] **C 阶段过程缺陷修复（3 个真实 bug）**：① `server/api/vault/notes/index.post.ts` 的 `const slug` 声明在 try 块内、`return { slug }` 在块外 → 新建笔记必然 500 `slug is not defined`（既有潜伏 bug，矩阵暴露后修复）；② `isStructuralPath` 未锚定深度，把结构目录的**深层内容**也判为结构（导致内容不可管理）→ 改为精确两层判定；③ rename / copy / delete 三个接口对「树内无扩展名 slug」的处理不一致（rename 缺回退、copy 缺回退、delete 回退不可达）→ 统一「原名 → 补 `.md`」约定
- [x] **D1 常量单源 + 写入工具**（2026-09-21）：`shared/import-limits.ts`（**前后端单源**：`MAX_FILE_BYTES=5MiB` / `MAX_TOTAL_BYTES=100MiB` / `MAX_FILES=500` / `ALLOWED_EXT=.md|.markdown|.txt` / `fmtBytes` / `fmtLimit` / `nameFormatProblem`）+ `server/utils/import-limits.ts` 转出；`server/utils/vault.ts` 抽出 `ensureDir` / `writeMarkdownAtomic`，`notes/index.post.ts` 改为复用（消除两份原子写实现）
- [x] **D2 导入三接口**（2026-09-21）：`server/utils/import-job.ts`（jobId 账本 + 10 分钟 TTL + 累计写入记账 + 越线回滚 + 「近期已入库」标记）；`preflight.post.ts`（**先校验后上传**：单文件/总量/数量/类型/非法名/目标存在性/同名冲突全在这一步判掉，超限 400 且零上传流量）；`file.post.ts`（multipart 逐文件上传，读完整流后按**真实字节数**复核，越限 413 + 回滚本 job 已写文件，原子写）；`finish.post.ts`（结果清单 + 主动批量入库）。三接口统一 `requireAdmin`
- [x] **D4 watcher 批量入库**（2026-09-21）：`server/utils/import-ingest.ts`（并发 8 + 20s 超时兜底 + 失败清单）；`server/plugins/watcher.ts` 跳过「本批已主动入库」的文件，避免同一文件被事件二次解析（既有串行队列 + `awaitWriteFinish(1000ms)` 下 500 文件需 500s+，必须绕过）
- [x] **D3 导入前端**（2026-09-21）：`app/composables/useNameRule.ts`（`nameProblem` **四处共用**：导入/新建笔记/新建文件夹/重命名）+ `useImport.ts`（限制常量取自 `#shared`、`preflight()` 纯函数与后端同源、`runImport()` 并发 3 上传调度）+ `components/ImportDialog.vue`（四步同屏：拖拽/选择文件/选择文件夹 → 父目录+子目录+保留层级+落点预览 → 阻断横幅+两条计量条+逐文件清单 → 结果面板）+ `layouts/default.vue` 顶栏「新建」下拉（笔记/文件夹/导入）+ 结构面板导入入口
- [x] **D5 nginx**（2026-09-21）：`nginx.conf` 增加 `client_max_body_size 8m;`（原缺该指令 → 默认 1MB，5MB 单文件会被 nginx 以 413 挡回、请求到不了 Nuxt；留出 multipart 开销后取 8m）
- [x] **D6 验收（spec 9.6 七条，API 侧 25 项 + 界面侧 11 项全绿）**（2026-09-21）：① 6.2MB 单文件预检 400（`超出 1.20 MB`）／绕过界面直传 → 413 + 回滚本 job 已写文件；② 104MB 批量预检 400（rule=total，零上传流量）；③ 8.6MB/4 文件落盘 + 4 篇详情可打开 + 目录树可见；④ `relPath: "../../etc/passwd"` → 400；⑤ 普通用户三接口 403；⑥ 与目标目录重名 → 整批阻断 400，重命名旧笔记后再导 → 通过；⑦ **300 文件：上传 2.0s + 收尾入库 1.45s（300/300，pending 0）**，列表搜索可检索。界面侧：阻断横幅文案 + 主按钮置灰（截图 `d_dialog_blocked.png`）、校验通过态按钮可用（`开始导入（4）`）、结果面板 `成功 4 篇 · 写入 8.60 MB · 入库 4/4`
- [x] **D 阶段过程修复**：`delete` 接口加退避重试（目录删除偶发失败）；清掉阶段 C 遗留的 `C阶段根目录测试` 目录；修复 `@nuxt/nitro-server` 残缺安装（缺 `dist/augments.mjs`，导致 `pnpm dev` 起不来）
- [x] **E0 基线与对照基建**（2026-09-21）：`.workbuddy/backups/e-shots.mjs` 采集 6 页 × 2 视口 × 2 主题 = 24 张前后对照截图 + `_report.json` 量化报告。**基线暴露三项既有缺陷**：① 390px 视口下 5/6 页面横向溢出（home 507 / notes 540 / detail 507 / graph 621 / admin 541 > 390）；② 最小字号 9px（spec 硬性下限 12px）；③ 旧棕色系 token（#FBFBFA 画布 / #121212 文字）与 DAWN 无关
- [x] **E1 令牌层**（2026-09-21）：`app/assets/css/main.css` 重写为 DAWN 令牌（画布/表面三级/描边/墨三级/交互色 + 种子-成长-常青-危险四语义色 + 8 个领域色相 + 字号阶梯含 15px 正文基线 + 4px 间距阶梯 + 圆角 6/8/12/16/20 + 阴影三级 + 动效 120/200/320ms 与 `cubic-bezier(0.32,0.72,0,1)` + 布局令牌 rail/header/measure/toc）；旧变量名（`--bg-primary` 等）保留为 DAWN 令牌**别名**保证迁移期不断代；`glass-card`/`glass-header`/`bg-mesh`/`.prose a` 改由令牌驱动；新增 `prefers-reduced-motion` 降级与统一 `:focus-visible` 描边（2px 强调色 + 2px 偏移）。`tailwind.config.js` 映射全部令牌（`bg-surface`/`text-ink-2`/`rounded-card`/`shadow-ds1`/`duration-base`/`ease-dawn`），兼容色阶 `garden`/`obsidian` 保留但色相对齐 DAWN
- [x] **E1 验证（19 项全绿）**：亮/暗两套令牌解析值与 spec 3.1 逐项一致；旧变量别名在双主题下仍可解析；正文基线 15px + Plus Jakarta Sans；**暗色首屏在 DOMContentLoaded 即暗色（无白闪）**；亮→暗为单调渐进淡入（12 个中间帧，终值 = #0A0D13，非硬切）；1440px 四页无横向溢出；产物含全部令牌与兼容类、动效降级与焦点描边规则
- [x] **E2 外壳（AppShell + RailNav + 分段侧栏）**（2026-09-21）：`layouts/default.vue` 重写为三段式（图标栏 60px + 顶栏 60px + 主体），高度锁 `h-screen`、各区域内部滚动；新增 `components/RailNav.vue`（品牌/首页/笔记/图谱/后台 + 主题 + 侧栏开关 + 退出，当前项 3px 指示条 + 强调底色）、`components/ContextSidebar.vue`（Vault 名 + 计数 + 过滤 + 导入/新建文件夹 + 结构/领域/标签分段面板 + 剪贴板插槽 + 底部同步状态）、`components/FacetList.vue`（领域色块 + 占比条 + 数量，点击即筛选）、`components/TagGroups.vue`（按命名空间分组、组头带计数、可折叠）；`FileTree.vue` 视图层重做（单根提升、折叠双重信号=箭头旋转 90°+文件夹着色、路径键折叠态、当前笔记高亮、成熟度圆点）；新增 `composables/useFacets.ts`（领域/标签分组/图谱统计的**真实数据派生**，纯函数）。保留：⌘K、侧栏宽度 localStorage 持久化、取数接口与缓存键不变；新增 ⌘\ 开关侧栏、<1024 抽屉 + 遮罩 + ESC
- [x] **E2 验证（24 项全绿）**：图标栏 60px + 4 个导航项 + 指示条；顶栏 60px + 面包屑 + 搜索触发 + 新建下拉；页面本身不整体滚动；三面板可切换；**领域计数与 `/api/notes?dir=` 接口逐项一致（前端 99 / 后端 69 / 计算机基础 56 / 运维 23，与 spec 原型分布吻合）**；标签 5+ 组且组头带计数；⌘\ 收起/展开；拖拽调宽写入 localStorage（400px）；六页可达无运行时异常；1440px 无横向溢出；侧栏最小字号 12px
- [x] **E2 顺带修复 2 个真实缺陷**：① **登录后角色化界面不出现**（`/api/auth/me` 在登录前缓存为 null，客户端跳转后不刷新，须硬刷新才出现「新建」下拉与管理入口）→ `login.vue` 登录成功后 `refreshNuxtData(['auth-me', ...])`；② **`html{font-size:15px}` 导致 Tailwind rem 阶梯整体缩小 6%**（`text-xs` 变 11.25px，低于 12px 下限；spacing 同步被压缩）→ 根字号恢复 16px，正文基线仍 15px（`body` 级）
- [x] **E3 页面与组件换肤**（2026-09-21）：新增原子件 `StatusBadge` / `DomainChip` / `TagPill` / `RoleBadge` / `PermissionList` / `DeniedState` / `EmptyState` / `Pagination`；浮层体系 `useToast` + `ToastHost`（aria-live=polite 三态）、`useConfirm` + `ConfirmHost` 与通用 `AppDialog`（role=dialog / aria-modal、焦点进入、ESC、遮罩关闭、右上角 `.modal-x`）——**9 处原生 prompt/alert/confirm 全部下线**（layout 3 处 + admin 1 处 + 详情页 3 处 + 结构树内联新建）；`NoteRow`（左缘 3px 领域色条 + 徽章行 + 17px 标题 + 等宽路径 + 摘要 + 标签 + 悬停箭头，紧凑模式隐藏摘要与路径）；`TocRail`（目录 + 进度环 + 属性面板，IntersectionObserver 当前项高亮）；`Menu`（更多操作：复制链接 / 复制路径 / **在结构树中定位** / 删除）；`NewFolderDialog`（父目录 + 名称 + 实时落点预览 + 行内校验）；`ArticleReader` 去内嵌 TOC、补完整路径面包屑与带领域徽章的反链卡片；`pages/index.vue` 重写（Hero + 统计条 + 6 条最近更新 + 右栏快速入口/常用标签/Vault 状态）；`pages/notes/index.vue` 重写（搜索清除 + 排序 + 密度切换 + 活动筛选芯片 + 窗口化分页 + 空结果原因）；`pages/admin.vue` 重写（打码 + 显示/复制 + switch 状态 + 角色徽章 + 权限清单 + 生成结果强调面板）；`pages/login.vue` 重写（左右分栏 + SVG 连线插画 + 密码可见性 + 行内错误）；图谱重做（四角浮层、**9 篇孤立笔记轨道化虚线描边**、默认按领域着色、标签 `paint-order` 描边底衬、弹簧力按度数归一化、收敛即停机）；`ImportDialog` 换肤并接入 `.modal-x`；页面级 9–11px 字号全部清理
- [x] **E3 验证（51 项全绿）**：登录页左右分栏 + 4 条能力 + 行内错误（aria-invalid）+ 密码可见性；首页 Hero/统计条（**与接口逐项一致 287/63/278/6**）/6 条行式/右栏；列表工具栏三档排序 + 密度切换 + 搜索清除 + 活动筛选 2 枚芯片 + 窗口化分页（1 2 … 15）+ 空结果原因；详情页完整路径面包屑（11 段）+ 目录栏（10 项目录 + 进度环 + 属性）+ 正文 16px + 「更多操作」4 项 + **结构树定位命中并切回结构面板**；后台身份卡 + 权限边界（✓/✗）+ 角色分段控件 + 打码 + switch + 相对时间 + **删除走应用内对话框且全程 0 次原生调用**；图谱 300 圆点 / **9 条虚线轨道** / 287 个描边标签 / 四角浮层 / 统计与接口一致（287 节点 · 278 连接 · 9 孤立）；五页 **0 处 <12px 文字**；390px 视口首页/列表/后台 **零横向溢出**
- [x] **E3 顺带修复 3 个真实缺陷**：① **FileTree 折叠态是每层实例私有**（自递归组件各有 setup 作用域）→ 展开只对本层生效，跨层展开/定位失效；改为 `useState('shell-tree-expanded')` 单源共享；② **单根提升时 `pathOf` 丢掉被提升根名**（第二层路径为 `03_Knowledge/后端` 而非 `KnowledgeBase/03_Knowledge/后端`，与 vault 相对路径不一致，任何按路径定位都失配）→ 提升后子层前缀带上根名；③ `Menu` 触发器未绑定开合（组件不自持状态，只受控）→ 包装层路由点击
- [x] **E4 移动端与收口**（2026-09-21）：断点对齐 spec 第 4 章表格 —— 图标栏改 `lg`（**≥1024 显示；768–1023 与手机隐藏**，此前 `md` 会让 768–1023 同时出现图标栏与抽屉却**没有汉堡按钮**，抽屉根本打不开）；汉堡 / 主题 / 遮罩 / 关闭悬浮键统一到 `lg` 断点；<1024 补顶栏「用户菜单」（管理后台或我的密钥 + 主题 + 退出登录，**修复图标栏隐藏后退出登录无入口**）；<640 顶栏收敛为 汉堡 / 末段标题 / 搜索图标 / 新建 / 用户（新增窄屏搜索图标按钮，此前 <640 无搜索入口）；顶栏图标按钮触控目标统一 **38×38**；`ContextSidebar` 去掉自身 `width: var(--sidebar-w)` 改为 `w-full`（**抽屉此前实际渲染 320px 而非 286px**，窄屏会溢出）；图谱窄屏最小可读缩放 **0.34**（断点跨越时同步 scaleExtent）、窄屏浮层收窄避免图例与统计重叠；`ImportDialog` @390 单列 + 按钮拉通 + 清单省略体积列；`CommandPalette` 换肤并补齐 **分组结果 / 命中高亮 / ↑↓↵ 键盘导航 / 底部快捷键提示** + `role="dialog"`
- [x] **E4 验证（50/50 全绿，且整套界面验收在 `pnpm build` 产物上复跑同样 50/50）**：六档宽度下图标栏与汉堡显隐符合断点表（1440/1280/1024 有栏无汉堡；1023/768/390 无栏有汉堡）；900px 抽屉贴左 286px + 遮罩可点关；390px 顶栏收敛为 汉堡 38×38 / 标题 / 搜索 38×38 / 新建 56×38 / 用户 38×38、深路径面包屑只留末段；用户菜单含管理后台/主题/退出登录；**五档视口 × 五页全部零横向滚动**；390px 详情页正文 358px（≥350）、目录栏 <1280 隐藏 1280 显示且 sticky；图谱 390px 缩放下限实测 k=0.34、四角浮层不重叠；导入对话框 358px 不溢出 + 单列 + 按钮覆盖整行 ≥85%
- [x] **E4 构建与全量回归**：`pnpm build` 通过（`.output` 22.6 MB / 102 个客户端资源）；**43 项跨阶段 API 回归在构建产物上全绿**（B 权限矩阵 9 条 + 可见范围 + C 文件操作 12 条 + D 导入限制 5 条 + 只读接口 8 条 + 清理 4 条），环境终态复位（密钥 2 条 / Note 287 / 无残留）
- [x] **E4 顺带修复 4 个真实缺陷**：① 768–1023 断点下抽屉**无法打开**（汉堡在 `md:hidden` 被隐藏，图标栏却仍显示）；② 图标栏隐藏后 **<1024 尺寸段没有任何退出登录入口**；③ `ContextSidebar` 自带 `width: var(--sidebar-w)` 覆盖抽屉宽度（渲染 320px 而非 286px）；④ **构建产物在 Windows 无法启动** —— nitro 的 `_importMeta_` 占位 `file:///_entry.js` 因 ESM import 提升先于入口赋值生效，内联的 Prisma 客户端 `fileURLToPath` 在 Win32 分支抛 `ERR_INVALID_FILE_URL_PATH`（Linux 下 `/_entry.js` 合法故 Docker 不受影响）→ 新增 `scripts/start-prod.mjs` 启动包装器（先设 `_importMeta_.url` 再导入入口），`pnpm start` 与 `entrypoint.sh` 同步切换
- [x] **阶段 F（收口）**（2026-09-21）：全量回归已随 E4 在构建产物上完成（E4 界面 50 项 + 跨阶段 API 43 项全绿）。部署侧核对以 **Docker 真实全栈**完成：`docker-compose -f docker-compose.local.yml up -d --build` 构建镜像（容器内 pnpm install + prisma generate + nuxt build 全流程）→ `entrypoint.sh` 执行 `prisma migrate deploy`（4 个迁移，无待应用）→ 应用经 `scripts/start-prod.mjs` 启动 → 端到端验证（未登录 302 跳登录、root 登录 200、列表/结构树 200、user 越权删目录 403、种子不重复创建）。nginx 为服务器宿主组件，`client_max_body_size 8m` 已在 D5 落入 `nginx.conf`（配置核对完成，线上实测需部署后进行）
- [x] **F 顺带修复 3 个部署阻塞项 + 2 个安全项**：① Dockerfile 运行阶段**缺 `COPY scripts`** —— `entrypoint.sh` 已改为 `exec node scripts/start-prod.mjs`，镜像里没有该文件会导致容器启动即失败；② 容器内 **pnpm@11 缺 `allowBuilds` 放行** → `@prisma/engines`/`esbuild`/`prisma` 的构建脚本被拦（`ERR_PNPM_IGNORED_BUILDS` 非零退出）——`pnpm-workspace.yaml` 显式放行三项并把镜像 pnpm 对齐到 12（与本机一致）；③ 本机 `docker compose`（V2 插件）不可用，需用独立版 `docker-compose`；④ **`.workbuddy/`（含明文测试密钥）与 `/.claude/settings.json`（含服务器 IP + root SSH 授权）此前不在 .gitignore**，即将随首次推送入库 —— 已加入 .gitignore 与 .dockerignore；⑤ `content/vault/.maturity-backup/`（运行时备份）入库 —— 已忽略
- [x] **F 文档完整性**：新增 `.env.example`（.gitignore 白名单引用但文件缺失）；`API.md` 补齐阶段 C/D 的 **7 个接口**（folders/rename/copy/nodes 删除/import×3）与 `admin/maturity/recompute`，并按三维角色体系重写管理接口章节（可见范围/越权文案/错误码 403·409·413）；`DEPLOY.md`/`PROJECT_PLAN.md`/`ecosystem.config.cjs`/`README.md` 的启动命令统一为 `scripts/start-prod.mjs`（`pnpm start`）
- [ ] 部署到云服务器（DEPLOY.md 流程）+ nginx 线上实测（需服务器环境，本机不可达）
