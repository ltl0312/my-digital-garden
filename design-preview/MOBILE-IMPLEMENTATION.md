# 阶段 M · 移动端 22 屏落地 —— 实施计划与进度

> 依据：`design-preview/MOBILE-PARITY.md`（22 屏 + 交互规范板，已评审）
> 代码库现状：Nuxt 4.5.1 + Tailwind 3.4 + Prisma。**阶段 A–F 已完成**，其中 **E4 已做过一轮基础响应式**
> （1024 断点抽屉侧栏、顶栏收敛、38px 触控目标）。
>
> ⇒ 因此本阶段是**改造既有响应式**，不是从零新建。所有改动以「不破坏 E4 已验收形态」为硬约束。

---

## 1. 阶段划分

| 阶段 | 内容 | 状态 |
|---|---|---|
| **M1** | 断点单源化 + 显式 viewport | ✅ 完成（45/45 验收） |
| **M2** | 移动端外壳：底部 TabBar + FAB + 顶栏吸顶与滚动联动 + 抽屉宽度公式 + 编辑态让位 | ✅ 完成（45/45 验收） |
| **M3** | 触屏手势：列表行长按操作面板（第 22 屏）+ 结构树长按 500ms 等价右键 | ⬜ 待开始 |
| **M4** | 浮层移动化：各对话框底部弹层化 / 详情 TOC 抽屉 / 图谱底部折叠面板 / admin 密钥列表卡片化 | ⬜ 待开始 |
| **M-收口** | 全量回归（多视口 × 多页 × 亮暗）+ `pnpm build` 产物复跑 + 文档更新 | ⬜ 待开始 |

---

## 2. M1 —— 断点单源化

**问题**：断点值此前散落在四处，E4 就因此出过真实缺陷。

| 位置 | 原值 | 后果 |
|---|---|---|
| Tailwind 前缀 | `sm`=640 / `lg`=1024 | — |
| `layouts/default.vue` `isNarrow` | 1024 | 与 `lg` 双轨并存，易错位 |
| `components/GraphView.vue` `minScale()` | 768 | 第三个断点值 |
| `app/assets/css/main.css` 媒体查询 | 640 | 第四个 |

E4 记录的真实缺陷：`md`(768) 与 `lg`(1024) 混用 → **768–1023 图标栏已隐藏、汉堡也被 `md:hidden` 藏掉，抽屉根本打不开**。

**产出**：
- 新增 `app/composables/useViewport.ts` —— 唯一权威断点源（`BP.sm`=640 / `BP.lg`=1024）+ `drawerWidth()` 公式 + `isPhone/isTablet/isNarrow/isDesktop`。
- `isNarrow` 改为取自该 composable；`layouts/default.vue` 内不再有断点字面量。
- `GraphView` 的 768 已加注释说明它是**「画布宽度」阈值而非视口断点**，明确不并入（避免误改已验证行为）。
- `nuxt.config.ts` 显式声明 `viewport`，并加 `viewport-fit=cover` —— **底部 TabBar / FAB 依赖 `env(safe-area-inset-bottom)`，而该值只在 `cover` 下非零**，否则刘海屏会被 Home Indicator 压住。

**关键取舍**：`useViewport().width` 首帧恒为 1440（桌面），挂载后校正。
这样 SSR 输出与客户端首帧结构一致，**不会 hydration mismatch**；代价是纯显隐类需求不能用它 —— 因此 TabBar / FAB 的显隐一律走 CSS（`sm:hidden`）。

---

## 3. M2 —— 移动端外壳

### 3.1 断点形态

| 视口 | 主导航 | 新建入口 | 侧栏 |
|---|---|---|---|
| ≥1024 | 图标栏 60px | 顶栏「新建」下拉 | 常驻 + 可拖宽 |
| 640–1023 | **无主导航**（维持 E4 形态） | 顶栏「新建」下拉 | 抽屉（汉堡） |
| **<640（手机）** | **底部 Pill TabBar** | 顶栏紧凑按钮 **+ FAB** | 抽屉（汉堡） |

### 3.2 新增文件

| 文件 | 职责 |
|---|---|
| `app/composables/useViewport.ts` | 断点单源 + 抽屉宽度公式 |
| `app/composables/useScrollActivity.ts` | `scrolled`（>8px）与 `hidden`（FAB 滚动隐藏）；向上滚动**或停止 300ms** 回归 |
| `app/composables/useNavItems.ts` | 主导航单源：图标栏与 TabBar 共用，含 `navItemActive()` |
| `app/components/BottomTabBar.vue` | 底部 Pill TabBar（`sm:hidden` 纯 CSS 显隐） |
| `app/components/AppFab.vue` | 52×52 FAB + 向上弹出层；动效只碰 `transform/opacity` |
| `app/components/CreateMenuItems.vue` | 「新建」三项动作单源（顶栏下拉与 FAB 弹出层共用） |

### 3.3 改造文件

- `app/layouts/default.vue` —— 主列为三段式（顶栏 / 主体 / TabBar）；抽屉宽度改用公式；顶栏吸顶 + 滚动联动底边分隔线（**仅手机生效**）；FAB 置于主体容器（自动位于 TabBar 之上）；关闭抽屉的悬浮键改为**仅平板显示**（否则与 FAB 叠在同一位置）。
- `app/components/RailNav.vue` —— 导航项改为 `useNavItems()`。
- `app/pages/notes/[...slug].vue` —— `editing` 同步到 `shell-editor-open`，编辑态隐藏 TabBar（离开页面复位）。
- `nuxt.config.ts` —— 显式 viewport。

### 3.4 与设计稿的 3 处有意偏差（均为实现约束所致，非降级）

| # | 设计稿 | 实现 | 理由 |
|---|---|---|---|
| 1 | TabBar 5 项（含「密钥」与「后台」两个 Tab） | **4 项**：首页 / 笔记 / 图谱 / 后台（普通用户显示为「密钥」） | 应用中「我的密钥」与「后台」是**同一个路由 `/admin`** 的角色自适应渲染（admin.vue:185 全角色渲染身份卡、:427 才对无权部分渲染 DeniedState），不存在两个目的地。4 项同时对齐了图标栏 |
| 2 | TabBar 标签 10px | **12px** | 项目硬性约束「界面文字下限 12px」（E3 验收项）。10px 会直接打破既有验收 |
| 3 | 手机端顶栏无「新建」按钮，FAB 是唯一入口 | **保留顶栏紧凑「新建」** | FAB 会随滚动隐藏（§5 ② 已评审确认），若顶栏不保留，滚动时会出现**没有任何新建入口**的死路 |

### 3.5 顺带修复的既有缺陷

**普通用户在桌面端没有任何入口进入「我的密钥」。**
`RailNav` 原实现为 `if (isAdmin.value) list.push('/admin')`，但 spec 8.4 明确「我的密钥」**所有角色可见**
（`pages/admin.vue:185` 起对全角色渲染身份卡）。现第四项恒在，标签按 `canManage` 在「管理后台 / 我的密钥」间切换 —— 与顶栏用户菜单口径一致。

---

## 4. 验证（M1 + M2，45/45 PASS）

脚本：`.workbuddy/backups/m-verify.mjs`（复用 E0 的 puppeteer-core + Chrome 方案，BASE=3100）

```
node .workbuddy/backups/m-verify.mjs
```

| 组 | 覆盖 | 结果 |
|---|---|---|
| 390×844 手机 | TabBar 可见/贴底/高 96/4 项文案正确 · FAB 可见且不与 TabBar 重叠 · 图标栏隐藏 · 无横向滚动 · 顶栏吸顶（滚动后 top 恒为 0）· 分隔线随滚动渐显/淡出 · **FAB 向下滚隐藏、向上滚回归** | 24/24 |
| 390 交互 | FAB 弹出含三项动作 · FAB→新建笔记对话框 · ESC 关闭 · TabBar 导航到 /notes · 抽屉宽 320 · 详情页仍有 TabBar · **编辑态隐藏 TabBar、取消后恢复** | 含上 |
| 768×1024 平板 | TabBar/FAB 隐藏 · 汉堡可见 · 抽屉可打开且宽 320（**E4 缺陷回归位**） | 5/5 |
| 360×780 小屏 | 无横向滚动 · 抽屉宽夹紧到 300 · TabBar 仍可见 | 3/3 |
| 639 / 641 边界 | 639 显示 / 641 隐藏（`sm` 精确边界） | 4/4 |
| 1440×900 桌面 | 图标栏可见 4 项含「管理后台」· TabBar/FAB/汉堡隐藏 · 无横向滚动 | 6/6 |
| 全局 | **无 hydration mismatch · 无控制台 error** | 2/2 |

截图：`.workbuddy/backups/m-shots/`（390 顶/滚动态/FAB 菜单/列表/抽屉/编辑态 · 768 抽屉 · 360 · 1440）
报告：`.workbuddy/backups/m-shots/_report.json`

### 验收过程中修正的 3 处「测试自身问题」（非实现缺陷，记录以备复盘）

1. FAB 隐藏断言最初用「计算透明度」，撞上 200ms 过渡 + 300ms 空闲回归 → 改为断言离散的 `pointer-events-none` 类，并把等待窗口收到 150ms。
2. 768 抽屉宽度按线性估算 630，实际公式是**双向夹紧**：`min(320, max(300, 768×0.82=629.8)) = 320`。
3. 图标栏链接数把品牌入口也计入（5 项），需按导航文案过滤。

另有一处**产品行为被测试误判**：进入 FAB 断言前滚动位置已是 500，再设 500 属「无位移」，
而规则是「**向下位移**才隐藏、非向下位移一律回归可见」—— 这是正确行为，测试需先复位到 0。

---

## 5. 已知问题

1. **`pnpm typecheck` 当前不可用（既有工具链缺陷，非本阶段引入）**
   实装 `typescript@7.0.2`（Go 重写版）的 `exports` 已不再暴露 `./lib/tsc`，而 `vue-tsc@3.3.11` 依赖该子路径：
   ```
   Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined by "exports"
   ```
   这解释了 execution-plan 里「vue-tsc 全项目跑通」长期未勾选。**需要决策**：把 `typescript` 降到 5.9.x（恢复 vue-tsc），或改用 TS7 配套的检查工具。本阶段以浏览器验收 + 运行时零错误作为替代门禁。
2. **开发模式下 Nuxt DevTools 的浮动徽标（右下 `153 ms`）会压住底部 TabBar** —— 仅 dev 出现，生产构建无此问题。若影响调试，可将 devtools 徽标位置改到左侧。
3. **生产构建尚未复跑**：dev 与 build 共用 `.nuxt/`，并发有冲突风险，故 `pnpm build` 留到 M-收口阶段串行执行。

---

## 6. 下一步

- **M3**：`NoteRow` 长按 500ms → 底部操作面板（复用 `CreateMenuItems` 的思路，动作按 `canManage` 收敛）；`FileTree` 长按 500ms 等价右键菜单；位移 <8px 判点击（与 `useScrollActivity` 的阈值同源）。
- **M4**：`AppDialog` / `ImportDialog` 底部弹层化；详情页 TOC 改顶栏按钮 + 抽屉；图谱图例/统计改底部可折叠面板；`admin.vue` 密钥表格卡片化。
- **M-收口**：多视口 × 多页 × 亮暗全量截图回归 + `pnpm build` 产物复跑 + 同步 `MOBILE-PARITY.md` 的实现状态。
