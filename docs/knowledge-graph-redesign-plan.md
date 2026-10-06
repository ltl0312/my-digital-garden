# 知识图谱界面改版 · 实施计划书

> 面向执行 agent 的完整施工说明。设计稿在 Ardot 文件 `728956537102973` → 页面「网站端 · 知识图谱改版 V3」（G1 总览 / G2 搜索面板 / G3 聚焦与最短路径 / G4 状态设计 / 交互规范板 / 改造对照板）。
>
> 本文档自足：即使不打开设计稿，也能按此施工。设计稿仅用于视觉对照。

---

## 0. 项目事实基线（执行前必读）

| 项 | 值 |
|---|---|
| 仓库 | `D:\Code\Nuxt\my-digital-garden` |
| 框架 | Nuxt 3 + Vue 3 + Prisma + PostgreSQL |
| 涉及源码 | `app/pages/graph.vue`、`app/components/GraphView.vue`、`server/api/notes/graph.get.ts` |
| 相关既有组件 | `app/components/CommandPalette.vue`、`FacetList.vue`、`TagPill.vue`、`AppSelect.vue`、`EmptyState.vue` |
| 相关既有 composable | `useFacets.ts`（`domainOfSlug` / `DOMAIN_HUE_DEG` / `domainColor`）、`useViewport.ts`（`BP`）、`useLongPress.ts` |
| 图谱缓存 | `server/utils/cache.ts` 的 `createCache(60_000)`，watcher 入库后调 `invalidateGardenCache()` |
| 类型检查 | `pnpm typecheck`（= `nuxt typecheck`） |
| 现有验收脚本 | `pnpm acceptance:shell` / `:gesture` / `:ui` / `:api` / `:all`（`scripts/acceptance/`） |
| **本机环境坑** | `npm`/`npx` 不可用；`pnpm` 可用。跑脚本前先 `export PATH="/e/Application/Node.js/Node.js:$PATH"` |

### 数据模型现状（`prisma/schema.prisma`）

```prisma
model Note {
  id, slug, title, content, htmlContent, summary?, maturity, isPublished,
  metadata Json, readingTime, createdAt, updatedAt
  tags NoteTag[]; outgoing NoteLink[]; incoming NoteLink[]
}
model NoteLink { sourceId, targetId   // @@id([sourceId, targetId])，无方向语义差异、无类型字段
model Tag { id Int, name }  @@unique(name)
model NoteTag { noteId, tagId }
```

**关键约束**：`NoteLink` 目前**不区分关系类型**。设计稿要求「实线=显式链接 / 虚线=标签共有」，需扩展（见 T2.1）。

### `/api/notes/graph` 返回结构（当前）

```ts
{ nodes: { id, title, slug, maturity, primaryTag }[],
  edges: { source, target }[] }
```

`primaryTag` 只取 `tags[0]`，**多标签信息丢失**；`edges` 来自 `prisma.noteLink.findMany()`，只有显式链接。

---

## 1. 改造目标与验收总则

### 1.1 必须达成（对应设计稿）

| # | 目标 | 验收方式 |
|---|---|---|
| A1 | 三区固定骨架：左筛选栏 272 / 中央画布（flex）/ 右详情栏 320 | 截图比对 + DOM 断言 |
| A2 | 单击节点 = 选中并展开右栏详情；**双击才进入正文** | 浏览器实测 |
| A3 | hover 出信息卡；选中时非相关降至 12% 不透明度、相关连线加粗至 2.4px | 截图 |
| A4 | 可见范围三选一：全图 / 2 跳邻居 / 两节点最短路径 | 截图 |
| A5 | 领域 / 成熟度多选过滤；关系类型（显式 / 标签共有）可分别开关 | 截图 |
| A6 | ⌘K 单入口跨字段搜索，结果分「笔记·标签·领域·命令」四组 | 截图 |
| A7 | 四种布局算法可切换，切换 400ms 补间，保留用户固定位置 | 截图 |
| A8 | 节点详情含入链/出链清单，每条可「在图中定位」 | 截图 |
| A9 | 加载骨架屏；筛选无结果空态；图谱真空态（独立，不复用） | 截图 |
| A10 | 性能分级：≤150 SVG / >150 自动 Canvas / >600 只画度数 Top 200 | 代码分支 + 运行时打点 |
| A11 | 固定状态有钉标 + 「双击解除」提示 | 截图 |
| A12 | 渲染性能常驻可见（FPS / 节点边数 / 首帧耗时） | 截图 |

### 1.2 明确不做（防止范围蔓延）

- ✕ 社区/时间线式**持续动画**力导向（永远动的图无法阅读）
- ✕ 在图上直接编辑正文（编辑与探索是两件事）
- ✕ 3D / 力导 sphere 视图
- ✕ 无限层级下钻（层次树只到目录级）
- ✕ 自定义节点图标上传
- ✕ 前端新增第三方图谱库（继续用 d3，已在依赖中）

---

## 2. 施工阶段总览

严格按 **fix → harden → optimize → policy → ship** 推进，每阶段**独立可交付、可验证**，验证通过才进入下一阶段。

| 阶段 | 内容 | 任务 | 准入门槛 |
|---|---|---|---|
| **P1 fix** | 数据层扩展 + 交互语义纠正 | T1.1–T1.4 | `pnpm typecheck` 通过；`pnpm acceptance:api` 通过 |
| **P2 harden** | 三区布局 + 筛选/搜索 + 节点详情 + 路径 | T2.1–T2.5 | `pnpm acceptance:all` 全绿；桌面截图比对通过 |
| **P3 optimize** | 渲染分级 + 布局算法切换 + 缩略图 + 性能打点 | T3.1–T3.4 | 首帧 <300ms；287 节点下 ≥55 FPS |
| **P4 policy** | 状态设计（骨架/空态/错误态）+ 无障碍 + 移动端回归 | T4.1–T4.3 | `pnpm acceptance:gesture` 通过；无 console 报错 |
| **P5 ship** | 文档 + 部署 + 硬刷新验证 | T5.1–T5.3 | 线上 `/graph` 视觉与本地一致 |

**每阶段纪律**：
1. 一次只改一处，改完 `git diff` 复核。
2. 禁止 `cat >> file << 'EOF'` 追加源码（会写乱），一律用 Edit/Write 工具。
3. 同一文件不要在一轮里并发多个 Edit（实测会静默丢失）。
4. 每阶段结束跑 `pnpm typecheck` + 对应 acceptance 脚本，**通过后才 commit**。

---

## 3. P1 · fix（数据层与交互语义）

### T1.1 扩展 `/api/notes/graph` 返回结构

**文件**：`server/api/notes/graph.get.ts`

**改动**：

1. `GraphData` 接口扩展为：
```ts
interface GraphNode {
  id: string; title: string; slug: string
  maturity: string
  primaryTag: string | null
  tags: string[]              // 新增：全部标签名（原数据被丢弃）
  domain: string              // 新增：由 slug 派生，与列表页同规则
  dirPath: string             // 新增：vault 内相对路径
  inDegree: number            // 新增：入链数
  outDegree: number           // 新增：出链数
  updatedAt: string           // 新增：ISO 字符串，供时间轴布局用
  readingTime: number         // 新增
}
interface GraphEdge {
  source: string; target: string
  kind: 'link' | 'tag'        // 新增：link=显式 [[链接]]；tag=标签共有（同一非空标签且无显式链接）
}
```

2. 查询改为：
```ts
const notes = await prisma.note.findMany({
  where: { isPublished: true },
  select: {
    id: true, title: true, slug: true, maturity: true,
    summary: true, readingTime: true, updatedAt: true,
    tags: { include: { tag: true } }
  }
})
```
`select` 里加 `summary`（节点详情摘要用）。

3. 边构建：先取 `prisma.noteLink.findMany({ select: { sourceId, targetId } })` 作为 `kind:'link'`；再对**节点标签集合**求同标签对，剔除已存在显式链接者，产出 `kind:'tag'`。注意 `NoteTag` 关联的 `Tag.name` 需一并取出做分组键。

4. 入/出度由边表一次遍历累计。

5. 领域派生复用 `app/composables/useFacets.ts` 的 `domainOfSlug`。**注意**：该文件在 `app/` 下，服务端无法直接 import。两种做法二选一：
   - 把 `domainOfSlug` / `DOMAIN_HUE_DEG` 移到 `shared/` 下并在两处 re-export（推荐，`shared/` 已被 `import-limits.ts` 占用，是既定共享位置）；
   - 或在 `graph.get.ts` 内按同样规则重写一份，并在注释里标注「与 useFacets.domainOfSlug 保持同步，改动需同步两处」。
   
   **执行者请选第一种**，避免规则双写。

6. 缓存 TTL 从 60s 保持不变；但数据结构变大后需评估，`createCache` 无改动。

**验收**：`curl` 该接口，确认 `nodes[0]` 含 `tags`/`domain`/`inDegree`/`updatedAt`；`edges` 中同时存在 `kind:'link'` 与 `kind:'tag'`。`pnpm acceptance:api` 不得回归。

---

### T1.2 纠正点击语义（单击选中 / 双击进入）

**文件**：`app/components/GraphView.vue`

**当前问题**（`GraphView.vue:181`）：
```ts
.on('click', (_, d) => router.push(`/notes/${...}`))
```
单击即跳转，图上无法查看详情。

**改法**：
1. 删除 `click` 处理器，改为 `selectedId` 状态 + `selectNode(id)` 方法。
2. 新增 `dblclick` → 进入正文（复用原 click 的 `router.push` 逻辑，抽成 `openNote(slug)`）。
3. 新增 `defineExpose({ ..., selectNode, clearSelection, getNeighbors, shortestPath })`。
4. 空白处单击 → `clearSelection()`（同时关闭右栏）。
5. 导出 `selection`（`ref<string | null>`）供页面做双向绑定。

**注意**：拖拽结束（`drag end`）也会触发一次 click 尾巴，需在 `drag` 的 `end` 里设 `suppressClick` 标志，在 click 里判掉（阈值：位移 < 4px 视为点击，与既有 `useLongPress` 的 8px 约定不冲突）。

**验收**：单击节点不跳转且右栏出现详情；双击进入笔记；从画布外拖回再松手不误触发选中。

---

### T1.3 抽出图谱数据 composable

**新建**：`app/composables/useGraphData.ts`

**职责**（把 `graph.vue` 里散落的派生逻辑集中）：
```ts
export function useGraphData() {
  // 内部 useAsyncData('graph-data', () => requestFetch('/api/notes/graph'))
  // 导出：nodes（含 domain/tags/degree）、edges、degreeMap、isolatedIds、
  //       domains、tags、maturityBuckets、stats { nodeCount, edgeCount, isolatedCount, linkCount, tagEdgeCount }
}
```
`domainNames` / `degreeMap` / `isolatedCount` / `stats` 现在在 `graph.vue` 里各算一遍，抽出来后 `graph.vue` 与新组件共用同一份，避免重复计算。

**验收**：`pnpm typecheck` 通过；`graph.vue` 改为调用该 composable 后行为不变（截图回归）。

---

### T1.4 骨架屏替换「图谱加载中…」

**文件**：`app/pages/graph.vue` 的 `<ClientOnly #fallback>`

**改法**：fallback 从一行文字换为骨架屏组件（设计稿 G4 左卡）：中心 SVG 示意骨架 + 底部进度条「正在解析 N 个节点…」。
节点数未知时用 `graph?.nodes.length`（未加载时显示「正在解析图谱…」），不要编造数字。

**验收**：`pnpm dev` + 限速网络下进入 `/graph`，无空屏闪烁。

---

## 4. P2 · harden（布局与核心功能）

### T2.1 三区固定骨架重构 `graph.vue`

**目标结构**（设计稿 G1）：
```
┌──────────────────────────────────────────────────┐
│ TopBar 56  品牌 / ⌘K 搜索框 / 同步状态 / 主题 / 头像 │
├─────────┬────────────────────────┬───────────────┤
│ LeftPanel│    GraphCanvas         │  RightPanel   │
│  272    │    flex（唯一主角）      │   320         │
│  筛选/图例│  画布 + 贴边浮层       │  节点详情     │
│  /性能   │                        │  （选中时）    │
└─────────┴────────────────────────┴───────────────┘
```

**改法**：
1. `graph.vue` 根容器改 `flex h-full`，三区用 `<LeftPanel>` / `<GraphCanvas>` / `<RightPanel>` 三个新组件承载。
2. **删除现有四角浮层**：`定位笔记`（左上）、`工具条`（右上）、`图例`（左下）、`统计`（右下）、`设置浮层`。它们的职责全部并入左栏与右栏。
3. 左栏内容自上而下（各自独立组件）：
   - `可见范围` 三选一（单选 radio：全图 / 2 跳邻居 / 最短路径）
   - `按领域（可多选）` 复选 + 色点 + 计数
   - `按成熟度（可多选）` 复选 + 计数
   - `关系类型`（显式链接 / 标签共有 各自开关 + 计数）
   - `显示`（常显节点标签 / 物理引擎 / 显示孤立节点）三个开关
   - `渲染` 状态条（WebGL·FPS / 节点边数 / 首帧耗时）
4. 右栏：默认宽度 320，内容为空时显示**图谱概览**（统计 + 孤立笔记清单），选中节点时显示**节点详情**。
5. 移动端（`<BP.lg` = 1024）：左栏改抽屉、右栏改底部弹层，沿用既有 `drawerWidth()` 与 `mobilePanelOpen` 模式（<640 的折叠面板已有实现，**不要推倒重做**）。

**不要动**：`useViewport.ts` 的 `BP` 常量、`GraphView.minScale()` 里的 768（注释已说明那是画布宽度阈值不是视口断点）。

**验收**：桌面 1440 截图与 G1 并排比对；三个断点（1440 / 1024 / 390）截图。

---

### T2.2 节点详情（T2.1 的右栏内容）

**新建**：`app/components/graph/NodeDetail.vue`

**结构**（设计稿 G1 右栏）：
1. 标题行：色点 + 标题（15px SemiBold）
2. 摘要（`summary` 字段，12px Regular，若为 null 则显示「暂无摘要」）
3. 路径（`工程 / 前端 / 进阶`，JetBrains Mono 11px）
4. 徽章行：常青/成长/幼苗 · 领域 · 度数 N
5. Meta 三格：入链 N（被引用）/ 出链 N（主动引用）/ 最近更新日期
6. Actions：**打开笔记**（主按钮，accent 实心）+ **聚焦邻居**（次按钮）
7. **入链列表**：每行 = 色点 + 标题 + 「在图中定位」，点击 → `focusNode(slug)`
8. **出链列表**：同上
9. 标签行：可点击标签 → 加入领域筛选

**数据来源**：由 T1.1 的 `GraphNode` 提供。边按 `sourceId`/`targetId` 双向索引得入链/出链。

**验收**：选中 `TypeScript 类型体操` 截图，核对入链 4 / 出链 2 与画布一致；点任一条「在图中定位」，画布平移+居中+脉冲。

---

### T2.3 筛选与可见范围

**新建**：`app/components/graph/FilterPanel.vue`；逻辑放 `useGraphData.ts` 或新建 `app/composables/useGraphFilter.ts`。

**规则**：
- 领域/成熟度复选：多选取**交集**（AND）。计数为「该组全量节点数」，不做动态联动的复杂预测，保持可预测。
- 关系类型开关：关掉 `tag` 边则标签共有连线消失；关掉 `link` 则显式链接消失。**至少保留一种**，全关时给出提示而非空图。
- 范围「2 跳邻居」：从 `selectedId` 出发 BFS 两跳，得节点子集；无选中节点时该选项禁用并说明原因。
- 范围「最短路径」：进入选点模式 → 点 A → 点 B → BFS 求最短路；无结果时提示「A 与 B 之间无连接，试试 2 跳邻居」。结果路径上的边加粗 2.4px、其余降至 12%。
- **空结果处理**：不清空画布，而是保留上一次视图 + 顶部提示条「当前筛选下没有匹配节点」+ 一键清除。**这是设计稿 G4 明确要求的**。

**验收**：勾选「工程 + 常青」得到交集子集；关掉「标签共有」虚线消失；三档范围切换截图。

---

### T2.4 ⌘K 跨字段搜索面板

**现状**：`app/components/CommandPalette.vue` 已存在，按领域分组、只搜 notes、上限 8 条。

**改法**：
1. **不改** `CommandPalette.vue`（首页/移动端在用）。**新建** `app/components/graph/GraphSearchPanel.vue`，仅图谱页使用。
2. 搜索源：前端本地过滤（节点已在内存，无需再请求）。字段：`title` + `tags[]` + `dirPath` + `summary`。**不搜正文全文**（正文可能很大，会破坏 <50ms 预算；设计稿 G2 页脚已注明搜索范围是「标题·标签·路径·正文」——**若要搜正文必须改为后端接口 + 索引，不得在前端做全文扫描**，见 T5.1 遗留项）。
3. 结果分四组：**笔记 / 标签 / 领域 / 命令**。命令组内置三条：
   - 按度数排序节点（找出枢纽笔记）
   - 查找两篇笔记之间的最短路径
   - 新建笔记并在图谱中定位
4. 键盘：`↑↓` 移动、`Enter` 执行（笔记/标签 → 选中并居中）、`Esc` 关闭、`Tab` 切换分组。
5. 领域组每项带「只看此领域」按钮 → 写入 T2.3 的筛选状态并关闭面板。
6. 底部显示「N 条结果 · M ms」与搜索范围说明。

**验收**：搜「类型」出 4 篇笔记 + 2 个标签 + 1 个领域 + 3 条命令；↑↓ Enter 能定位。

---

### T2.5 聚焦与邻域高亮

**文件**：`app/components/GraphView.vue`（SVG 层）

**改法**：
1. 新增 `focused` 计算属性：`selectedId` 的 1 跳或 2 跳邻域（依 T2.3 的范围设置）集合。
2. 选中时：
   - 邻域内节点：保持 100% 不透明度，描边 2.5px
   - 邻域外节点：**不透明度 0.12**（`opacity` 属性，120ms 线性过渡）
   - 邻域内连线：`stroke-width` 2.4px
   - 邻域外连线：0.12 不透明度
3. hover 信息卡：跟随节点但**自动避让边界**（贴近画布右/下边缘时翻转到另一侧），显示 标题 / 成熟度 / 领域 / 度数 / 摘要前 60 字 + 两枚按钮「聚焦邻居」「打开笔记」。用 `pointer-events: none` 防止卡片自身拦截 hover。
4. **hover 连线**：加粗并显示两端节点名（SVG `<title>` 或轻量 label）。
5. 拖拽固定后：节点加**钉标**（8px 圆点 + 图标），画布左上出现提示条「节点已固定 · 双击解除」（amber 语义色，设计稿 G1 已有）。

**验收**：截图需与设计稿 G1 一致（非相关节点明显变暗、相关连线加粗）。

---

## 5. P3 · optimize（性能与布局算法）

### T3.1 渲染分级

**文件**：`app/components/GraphView.vue`（建议再抽 `app/components/graph/` 下的渲染器）

| 节点数 | 渲染器 | 标签策略 | 边 |
|---|---|---|---|
| ≤150 | SVG | 度数 ≥4 常显 | 全量 |
| 151–600 | Canvas 2D | 仅 hover/选中 | 全量 |
| >600 | Canvas 2D | 仅 hover/选中 | **默认只画度数 Top 200 节点**，其余按需展开 |

**关键实现点**：
1. 阈值集中为常量 `export const RENDER_TIERS = { svg: 150, canvas: 600, topN: 200 }`，**不要散落字面量**。
2. Canvas 模式：节点/边绘在一张 `<canvas>`，`devicePixelRatio` 缩放；文本标签用绝对定位的 DOM 层（避免 canvas 文字模糊）。
3. 缩放/平移：SVG 模式改 `transform` attribute；Canvas 模式改 `ctx.setTransform`。**不要每帧重算布局**。
4. 切换时机：切换渲染器时**保留当前节点坐标与 zoom**，不重排。
5. 切换时给用户明确告知（设计稿 G4 中卡）：「已自动切换为 Canvas 渲染并关闭常显标签 · 节点数超过 150」，并说明缩放到 150% 以上恢复常显。
6. 性能打点：组件内维护 `fps`（rAF 计数滑动窗口）、`firstPaintMs`（`onMounted` 到首帧绘制）。**用 `ref` 暴露给页面**，左栏渲染状态条消费。禁止在生产环境 `console.log`。

**验收**：构造 287 节点与 700 节点两档 fixture（可用测试 vault 或临时脚本注入），FPS ≥55，内存 <120MB；首帧 <300ms。

---

### T3.2 布局算法切换

**新建**：`app/lib/graphLayouts.ts`（纯函数，便于单测）

```ts
export type LayoutName = 'force' | 'tree' | 'radial' | 'timeline'
export interface LayoutContext {
  nodes: GraphNode[]; edges: GraphEdge[]
  width: number; height: number
  degreeMap: Map<string, number>
  pinned: Set<string>        // 用户固定的位置，任何算法下都保留
}
export interface LayoutResult { positions: Map<string, { x: number; y: number }> }
export function computeLayout(name: LayoutName, ctx: LayoutContext): LayoutResult
```

- **force**：现有 d3 力导向（`forceLink` distance 120、`forceManyBody` -320、`forceCollide` r+10、`alphaDecay` 0.032、`velocityDecay` 0.42）。**把弹簧力归一化那段保留**（已按端点度数归一化，MOC 类高连接节点不会被反复拉扯 —— 这是既有正确决策）。
- **tree**：按 `dirPath` 建层次，目录级为根，d3-hierarchy 布局。**只到目录级，不做无限下钻**。
- **radial**：以度数最高的 MOC（入度 Top1 且 tags 含索引语义，或直接取 `inDegree` 最大节点）为圆心，按跳数分层半径。
- **timeline**：x = `updatedAt` 线性映射，y = 领域分泳道。

**切换行为**：
- 节点 id 不变，位置做 400ms 补间（`d3.transition` 或自写 easing），**不是重排跳变**。
- 用户 `pinned` 的位置在四种算法下都保留，冲突时 pinned 优先。
- 力导向**收敛即停机**，静止时 0% CPU（现有 `alphaDecay` 已满足，保留 `simulation.on('end')` 同步开关状态）。
- 布局选择持久化到 `localStorage`（沿用既有 `garden-graph-settings-v2`，加 `layout` 键，**注意版本号**：结构变了要 bump 到 v3 并做一次迁移或直接重置）。

**验收**：四种算法各截图；切换过程补间可见；固定节点在切换后不动。

---

### T3.3 缩略图（Minimap）

**新建**：`app/components/graph/Minimap.vue`

- 右上角 164×112，`surface` 底 + 1px border + 圆角 10。
- 内容：全图节点/边的极简缩略（半径 2–4px），当前视口用 accent 8% 填充 + 55% 描边矩形表示。
- **可拖拽**：点/拖缩略图 → 主画布平移；滚轮/双指 → 缩放。
- 节点 >600 时只画 Top 200（与 T3.1 一致）。

**验收**：拖缩略图主画布跟随；视口矩形随缩放正确变化。

---

### T3.4 缩放与拖拽体验补齐

**文件**：`GraphView.vue`

1. **缩放级别可见**：缩放条中间显示 `Math.round(k * 100)%`（JetBrains Mono）。当前 5 个按钮：`−` / 百分比 / `+` / 适配全图 / 重置布局。
2. **缩放锚点**：`d3.zoom` 保持默认的「以光标为锚点」；按钮缩放时以**画布中心**为锚点更符合预期（现有 `zoomBy` 走 `scaleBy`，d3 默认以中心为锚点，正确）。
3. **fitView 修正**：现有实现 `k = clamp(min((size.w - pad*2)/w, ...), 0.2, 2.4)`。改为同时考虑 minimap 与安全边距，`pad` 提到 96，`k` 上限 2.4 保留，下限改为 `minScale()`（当前 `minScale` 窄屏 0.34 / 宽屏 0.2 **是画布宽度阈值不是视口断点**，别改成 `BP`）。
4. **节点拖拽阈值**：位移 <4px 视为点击（见 T1.2）。
5. **物理开关语义**：现有 `togglePhysics` 点火后收敛自动置 `false`，用户会误以为出 bug。改为：收敛后开关显示「已收敛 · 重新点火」而非「已停止」。
6. **持久化**：`garden-graph-state` 存 `pos` + `zoom` + 本次新增 `pinned` 集合 + `layout` + 筛选状态。`persistState` 在 zoom end / drag end / beforeunload / onScopeDispose 触发，**已存在，勿重复实现**。

---

## 6. P4 · policy（状态、无障碍、回归）

### T4.1 三类状态分离

设计稿 G4 明确要求三种状态**互不复用**：

| 状态 | 触发 | 内容 | 出口 |
|---|---|---|---|
| **加载中** | 请求未完成 | 骨架屏 + 「正在解析 N 个节点…」 | 无（自动消失） |
| **筛选无结果** | 筛选/搜索有条件但无匹配 | 图标 + 「当前筛选下没有节点」+ **具体是哪两个条件冲突**（如「『工程』与『常青』同时选中，但两者没有重叠的笔记」）+ 主按钮「清除全部筛选」+ 次按钮「只看「工程」」 | 清除筛选 |
| **图谱真空态** | `nodes.length === 0` | **引导式面板**：说明「链接产生结构」+ 提供 3 篇预置 MOC 模板可一键导入 + 导入后自动聚焦新节点 | 导入模板 / 新建笔记 |

**另需补**：**错误态**。`useAsyncData` 的 `error` 分支要给图谱专用的错误卡（网络失败 / 无权限 / 解析失败），文案区分「重试」与「回到首页」两个出口。不要复用 `ErrorState`（若无则新建，勿改通用组件影响其他页）。

### T4.2 无障碍

1. **节点可聚焦**：`graph` 容器 `tabindex="0"`；`↑↓←→` 在**几何邻近**节点间移动焦点（不是数据顺序），`Enter` 打开。
2. **三区间 Tab 循环**：画布 → 筛选栏 → 详情栏 → 回画布。
3. `Esc` 逐层退出：详情栏 → 筛选浮层 → 全屏。
4. 快捷键（设计稿规范板②）：
   - `⌘K` 搜索、`⌘F` 聚焦搜索框、`G` then `F` 适配全图
   - `⌘L` 锁定/解锁选中节点
   - `/` 打开命令面板
   - `Delete` 断开选中节点全部关系（**必须二次确认**，走既有 `useConfirm`）
5. 画布加 `role="application"` + `aria-label="知识图谱，共 N 个节点"`；信息卡 `role="tooltip"`；筛选复选用真 `<input type="checkbox">` + `aria-checked`。
6. **焦点可见**：所有可交互元素有 `:focus-visible` 环（accent 色 2px）。
7. 对比度：正文至少 4.5:1，辅助文字至少 3:1。注意 `ink3`(#788299) 在 `canvas`(#0A0D12) 上约 4.3:1，**用于 12px 以下正文时需提升到 ink2**。

### T4.3 移动端回归

**不要重写**，沿用既有 `<640` 折叠面板实现，只做适配：
1. 筛选面板 → 底部弹层（`DrawerW`，既有 `drawerW()`）。
2. 节点详情 → 全屏底部弹层。
3. 保留既有手势契约（`acceptance:gesture` 是回归基线）：
   - 命中节点（半径 24px）：拖拽 = 固定，双击 = 解除
   - 命中空白：单指拖拽 = 平移
   - 双指捏合 = 缩放（优先级低于节点拖拽）
   - 长按节点 300ms 强制拖拽
4. 触控目标 ≥44×44（现有工具按钮 32×32 **不达标**，移动端需提到 44）。

---

## 7. P5 · ship

### T5.1 文档
1. 更新 `API.md`：新增/变更的 `GraphNode` / `GraphEdge` 字段。
2. 更新 `PROJECT_NOTES.md`：本次改造范围与不做项。
3. 遗留项要显式记录：**搜索尚未覆盖正文全文**（G2 页脚已标注范围含正文）—— 若要补，需后端 `tsvector` 索引或 Meilisearch，不得前端全文扫描。

### T5.2 验收脚本
新增 `scripts/acceptance/graph-verify.mjs`，纳入 `pnpm acceptance:all`。至少覆盖：
- `/api/notes/graph` 返回含新字段，`edges` 含两种 `kind`
- 单击不跳转 / 双击跳转
- 筛选交集正确性（构造 fixture 断言节点数）
- 关系类型开关生效
- 渲染分级阈值切换（mock 151 / 601 节点）
- 三类状态各自出现
- 无 console error

### T5.3 部署
按既有链路：本地 `git push` GitHub → `ssh + scp` 至 `8.163.35.246` → Docker 构建 → `liutianle.cn/graph`。
**部署后必须 Ctrl+F5 硬刷新验证**（CSS/JS 缓存会导致旧样式残留，本机已多次踩坑）。

---

## 8. 给执行 agent 的硬性提醒

1. **不要用 `cat >> file << 'EOF'` 追加源码** —— 本沙箱实测会写乱文件（整份 CSS 被覆盖、规则丢失）。一律用 Edit/Write。
2. **同一文件不要在一轮里并发多个 Edit** —— 实测只有最后 1~2 个真正落盘，前面的静默丢失（工具都回报 success）。一次只改一处，改完 `git diff` 或 `grep` 复核。
3. **断点一律取 `useViewport.ts` 的 `BP`** —— 不要再写字面量 640/768/1024。
4. **领域派生规则只有一份** —— 移到 `shared/`，不要在服务端和客户端各写一遍。
5. **渲染阈值、边长、路径长度等常量集中定义** —— 不要散落字面量。
6. **不要重写移动端 `<640` 折叠面板** —— 那是既有交付物，改动需 `pnpm acceptance:gesture` 背书。
7. **`pnpm` 可用，`npm`/`npx` 不可用**（会被安全策略拦截）。跑脚本前 `export PATH="/e/Application/Node.js/Node.js:$PATH"`。
8. **慢网络 git 操作丢后台跑**（`run_in_background`），前台会被 SIGTERM 静默杀掉；判定 push 结果以 `git ls-remote origin <ref>` 为准，**别看前台退出码**。
9. **每阶段结束 commit 一次**，commit message 用 Conventional Commits（项目有 `standard-changelog-flow` 约定）。
10. 遇到设计稿与本计划冲突时，**以本计划为准**（本计划已把设计稿的视觉决策转成了可执行规则）；若认为计划本身有问题，先说明再改，不要静默偏离。
