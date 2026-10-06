# 自动化验收脚本

这些脚本驱动真实浏览器（puppeteer-core + Chrome）对**运行中的应用**做断言式验收，
是各阶段收口的门禁。全部从**仓库根目录**运行（截图/报告按相对路径写入 `.workbuddy/backups/`，
该目录不入库）。

## 前置

1. 被测应用已在 `GARDEN_BASE`（默认 `http://localhost:3100`）可访问：
   - dev：`pnpm dev --port 3100`
   - 生产产物：`pnpm build` 后 `set -a && . ./.env && set +a && PORT=3100 pnpm start`
2. 复制 `scripts/acceptance/.env.acceptance.example` 为仓库根目录 `.env.acceptance`，
   填入 root 密钥（该文件已被 `.gitignore` 覆盖，不会入库）。
3. `puppeteer-core`：项目内安装，或用 `PUPPETEER_CORE_DIR` 指向一个含它的目录。

## 套件

| 命令 | 覆盖 |
|---|---|
| `pnpm acceptance:shell` | M2 移动端外壳（TabBar / FAB / 吸顶 / 抽屉宽度 / 编辑态让位），47 项 |
| `pnpm acceptance:gesture` | M3+M4 长按操作面板 / 底部弹层 / 目录抽屉 / 图谱面板 / 密钥卡片，43 项 |
| `pnpm acceptance:ui` | E4 响应式断点与移动端细节，51 项 |
| `pnpm acceptance:api` | 跨阶段 API 回归（权限矩阵 / 文件操作 / 导入限制），44 项 |
| `pnpm acceptance:suggest` | 标签 · 领域自动分配与审核（权限门禁 / 生成→审核→写回 frontmatter / 显式领域优先级 / 重入库保留 / 审计轨迹 / AI 设置 / 多选器列表契约），76 项 |
| `pnpm acceptance:picker` | 笔记多选器 UI（打开/筛选/跨页多选/生成后审核面板收敛），16 项 |
| `pnpm acceptance:entries` | 入口与设置 UI（AI 开关点击即保存 / 多选器确认后立即关闭 / 结构树右键与详情页「更多操作」都有「标签 · 领域自动分配」），13 项 |
| `pnpm acceptance:prod` | **生产只读**部署校验（新端点存在 / 字段形状 / 权限仍生效），19 项 —— 全程只发 GET |
| `pnpm acceptance:shots` | 多页 × 亮暗 × 视口截图与量化报告（溢出 / 最小字号 / 主题） |
| `pnpm acceptance:all` | 上面各套断言套件依次跑完（不含 `acceptance:prod`，它要显式指定生产地址） |

脚本以「总项数 / PASS 数」收尾，任何 FAIL 都会以非零码退出，可直接接进 CI。

## 注意

- `acceptance:api` 会在数据库里**临时创建并删除**一个 user 密钥与一个管理员密钥，
  并在跑前后核对密钥总数一致；测试目录 `KnowledgeBase/E4回归` 会被自动清理。
- `acceptance:suggest` 同样自给自足：临时建/删一个 admin 与一个 user 密钥，
  在 `KnowledgeBase/E0标签审核` 下建/删自己的测试笔记，并在知识区临时建/删一个领域目录
  `E0测试领域`（用于验证「用户自建的领域目录必须被白名单接受」）。它**不修改任何真实笔记**，
  但会**真实改写自己那篇测试笔记的 frontmatter**（这正是被测行为）。
- 🚫 **`acceptance:api` / `acceptance:suggest` / `acceptance:picker` / `acceptance:entries` 都绝不能对生产跑**（都会真实写数据）。
  生产上线后要断言新功能，用 **`acceptance:prod`**（只读，只发 GET）。
- ⚠️ **`nuxt typecheck` 查不出 Vue 模板编译错误**：把组件插进 `v-if` 的 `</template>` 与 `v-else`
  之间会报「v-else/v-else-if has no adjacent v-if or v-else-if」并让整页 500，而 typecheck 仍然通过。
  改过模板后**必须真正加载页面**（`acceptance:picker` 的 U0 与 `acceptance:entries` 的 E1 就是这条断言）。
- 断言一律优先使用 `data-testid` 等稳定语义钩子；**不要**用类名子串或界面文案做定位 ——
  这类断言会随实现演进静默失效（曾出现过「匹配到了新容器所以假通过」的事故）。
- 断言失败时**打印原始响应**：只报 `ok=false`/`err=` 无法区分「顶层 4xx」与「逐条处理失败」
  （两者都不会填 `results[0].error`），会白跑一轮定位。
- 断言要**排除假通过**：多选器那套曾经只断言「标题出现在面板里」，而面板当时错误地展示了
  全库 56 条待审 —— 标题当然在里面。改成断言**面板条目数 == 本次生成篇数**才真正有效。
- 断言里的**元素判据别写死**：例如用 `.endsWith('.md')` 判文件树节点永远匹配不到（`pathOf` 返回的
  name 已去掉 `.md`），可靠判据是「目录行有 `aria-expanded`、文件行没有」。写死的判据会假失败，
  和假通过一样浪费时间。异步面板要**轮询到表头出现**再断言条目数，不能只等元素挂载
  （挂载时列表还没拉到，会渲染空态而误报 -1）。
