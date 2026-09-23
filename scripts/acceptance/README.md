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
| `pnpm acceptance:shots` | 多页 × 亮暗 × 视口截图与量化报告（溢出 / 最小字号 / 主题） |
| `pnpm acceptance:all` | 上面四套断言套件依次跑完 |

脚本以「总项数 / PASS 数」收尾，任何 FAIL 都会以非零码退出，可直接接进 CI。

## 注意

- `acceptance:api` 会在数据库里**临时创建并删除**一个 user 密钥与一个管理员密钥，
  并在跑前后核对密钥总数一致；测试目录 `KnowledgeBase/E4回归` 会被自动清理。
- 断言一律优先使用 `data-testid` 等稳定语义钩子；**不要**用类名子串或界面文案做定位 ——
  这类断言会随实现演进静默失效（曾出现过「匹配到了新容器所以假通过」的事故）。
