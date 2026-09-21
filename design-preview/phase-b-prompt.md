# 任务：拾光 · 数字花园 — 阶段 B（三级角色权限体系）

## 背景
- Nuxt 4 + Prisma(PostgreSQL) 项目：`D:\Code\Nuxt\my-digital-garden`（Windows，Git Bash）。
- 执行计划书：`design-preview/execution-plan.md`（第 6 节有当前进度，阶段 A 已全部完成）。
- 权限设计规范：`design-preview/design-spec.html` 第 8 章 8.1–8.5（下述「权限模型」已提炼要点，冲突时以 spec 原文为准）。
- 现状：`prisma/schema.prisma` 的 AccessKey.role 仅 `"admin" | "user"`（无约束 String，:67）；`server/utils/auth.ts` 只有 requireAdmin（无二维校验）；管理接口在 `server/api/admin/keys/`（index.get / index.post / [id].patch / [id].delete）+ `maturity/recompute.post.ts`；前端 `pages/admin.vue` 为单页，无角色化拆分。

## 权限模型（spec 8.1–8.5 要点）
- 三角色：**root**（初始管理员，内置唯一，系统最高权限）/ **admin**（普通管理员）/ **user**（普通用户，只读）。
- 校验是**二维**的：发起者角色 × 目标对象角色。写成纯函数 `canCreate(targetRole)` / `canToggle(target)` / `canDelete(target)`，返回 `{ ok, why }`。
- 矩阵：
  - **查看**：root 全部；admin 仅「自己 + 全部普通用户」（可见范围**下沉到查询层 where**，禁止取全量后前端过滤）；user 仅自己。
  - **创建**：root 可建 admin/user；admin 仅可建 user；**不能再创建第二个 root**（内置唯一，否则保护位失效）。
  - **禁用/启用**：root 可禁 admin/user；admin 只能禁 user（**含自己也不行**——「不能变更自己的密钥状态」）；无人可禁 root。
  - **删除**：权限与禁用一致 + 全部二次确认；无人可删 root。
  - **root 保护位必须在服务端生效**：任何 disable/delete 请求目标为 root/isBuiltin → 403。界面置灰只是第一道门（spec 8.5）。
- 任何人都不能禁用/删除自己正在使用的密钥（防自锁）。

## 步骤（沿用 fix → harden → optimize → publish 节奏，每步先验证再推进）

### B1 数据迁移（中风险）
- `prisma/schema.prisma`：role 保持 String 但应用层白名单校验（spec D5）；新增 `createdBy String?`、`isBuiltin Boolean @default(false)`。
- **迁移前先 `pg_dump` 备份**；迁移 SQL 中把存量现有 admin 密钥标记 `isBuiltin = true`（role 保持 admin，root 由该内置身份承载——若 spec 定义 root 为独立 role 值，则内置身份 role 直接写 root，以 spec 8.1 为准，实施前读 spec 确认）。
- 验证：`prisma migrate dev` 成功；迁移后核对存量行（数量、isBuiltin 标记）。

### B2 服务端二维校验
- `server/utils/auth.ts` 新增判定函数；`server/api/admin/keys/` 4 个接口逐条接入（index.get 的 where 可见范围、index.post 的 targetRole、[id].patch、[id].delete）。
- 越权提示文案沿用 spec 8.5（如「越权操作：初始管理员不可被删除」）。
- 验证：**12 条越权矩阵逐条 curl**（见计划书第 5 节第 5 条：普通管理员禁用自己→403；任何身份删/禁初始管理员→403；普通用户访问管理接口→403；普通管理员建管理员→403；root 不可见"创建初始管理员"；等等），同时回归合法路径不被误拦。

### B3 前端管理页
- `pages/admin.vue` 拆为「我的密钥」（所有角色可见：身份卡——密钥打码+复制、状态、创建者；+权限边界清单）+「密钥管理」（同一路由三形态：root 全量 / admin 收窄子集+顶部「看不到什么」说明 / user 无权限页+两个出口）。
- `layouts/default.vue` 图标栏角色化可见性（user 不渲染管理入口）。
- 原型 ROLES/canToggleKey/canDeleteKey 移植为 composable；不可操作的行写明原因（行右侧 + title），root 行显示「🔒 内置身份」。
- 验证：浏览器三身份切换对照 spec 8.3 三形态。

## 收尾要求
- 新增/改动 TS 用 `tsc --noEmit --strict` 单独验证（vue-tsc 全项目当前跑不通是已知问题，勿纠缠）。
- 长命令（migrate、dev server）丢后台执行，以远端/日志输出判定结果，**别看前台退出码**。
- 完成后：更新 `execution-plan.md` 第 6 节进度 + `.workbuddy/memory/` 当日日志；输出已完成项汇总表（步骤/改动文件/验证结果）；**经确认后才进入阶段 C**。

## 环境注意（Windows，硬约束）
- node_modules 为 hoisted 布局（`pnpm-workspace.yaml` 的 `nodeLinker: hoisted`），勿改该配置、勿删 node_modules。
- 源码编辑一律用 Write/Edit 工具或 Python `open(...,'w')`；**禁止 bash heredoc 追加源码**；同一文件一轮只做一处修改，改完 grep 复核。
- 禁用 `rm -rf`；Git Bash 里 `find`/`timeout` 被 Windows 版本抢占，勿用。
