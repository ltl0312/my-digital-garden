# 数字花园 · 生产部署手册（Docker）

> 目标环境：阿里云 ECS `8.163.35.246`（Alibaba Cloud Linux 4，2 核 / 1.6G 内存 / 40G）
> 技术栈：Nuxt 4（Nitro 生产产物）+ PostgreSQL（**宿主原生**）+ Docker + Nginx + acme.sh
> 线上域名：`https://liutianle.cn`
>
> 最后核实：2026-10-06（v1.9.7 已上线）。**线上由 Docker 容器承载，PM2 未在运行**（历史 PM2 路径见 §9）。

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
| `latest` / `v1.9.7` | `6a6a5fe43ba2` | **新建/重命名/删除三处缺陷修复**（详见下方 v1.9.7 说明）（**当前**） |
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

服务器上现存的镜像归档：`/opt/garden-image-v1.2.0.tar` ~ `/opt/garden-image-v1.9.7.tar`（v1.1.0 的 `garden-image-new.tar` 已删；每个版本一份，按版本号即可回滚）。

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
# 仓库根目录
docker build --progress=plain -t my-digital-garden-app:v1.1.0 -t my-digital-garden-app:latest .
```

`Dockerfile` 为多阶段构建（`node:24-alpine`）：

- **build 阶段**：先只 COPY `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `prisma/` / `prisma.config.ts` → `pnpm install --frozen-lockfile` → 用占位 `DATABASE_URL` 跑 `prisma generate`（仅为让 schema 类型可用）→ 再 `COPY . .` → `pnpm build`。分层顺序是为了让依赖层吃缓存。
- **runtime 阶段**：`pnpm install --frozen-lockfile --prod` → `COPY --from=build /app/.output` + `scripts/` + `entrypoint.sh`，`EXPOSE 3000`，`CMD ["./entrypoint.sh"]`。

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
curl -s -o /dev/null -w '%{http_code}\n' https://liutianle.cn/api/notes/graph  # 401（未登录，正常）
docker inspect garden-app --format 'Image={{.Image}} Started={{.State.StartedAt}} Mem={{.HostConfig.Memory}}'
free -m
```

### 5.2 新代码确实生效

```bash
# 服务端产物含新字段
docker exec garden-app sh -c "grep -o dirPath /app/.output/server/chunks/routes/api/notes/graph.get.mjs | wc -l"
# 客户端产物含新 testid
docker exec garden-app sh -c "grep -rl graph-minimap /app/.output/public/_nuxt/"
```

### 5.3 登录后只读校验接口形状

登录用 root 密钥（`POST /api/auth/verify`，body `{"key":"..."}`，成功下发 `garden_token` cookie），然后 `GET /api/notes/graph` 应返回：

- `nodes[]` 含 `id,title,slug,maturity,primaryTag,tags,domain,dirPath,inDegree,outDegree,updatedAt,readingTime,summary`
- `edges[]` 含 `source,target,kind`（`kind` 为 `link` / `tag`）

### 5.4 只读验收套件（推荐）

```bash
# Windows PowerShell
$env:GARDEN_BASE='https://liutianle.cn'
pnpm acceptance:prod      # 只读部署校验 19 项：新端点存在 + 字段形状 + 权限仍生效（**全程只发 GET**）
pnpm acceptance:graph     # 图谱重构 120 项，配色部分会自动快照并还原
pnpm acceptance:shell     # 外壳 47 项，只开对话框不提交
pnpm acceptance:ui        # UI 51 项，只开对话框不提交
```

> 💾 **`acceptance:graph` 会动配色，但跑完会原样还原**：为覆盖「写服务端 / 跨设备恢复 / 清除」
> 这些用例，它必须真的 PUT 与 DELETE `/api/graph/colors` 与 `/api/graph/color-rules`。
> 快照在**任何用例跑之前**取（G67 的「清除全部颜色」会连用户自己的配色一起清掉），
> 收尾按快照的**精确状态**写回：有配色就 PUT 回来，原本「从未保存过」（`updatedAt === null`）
> 就 DELETE 回出厂状态——PUT 空数组语义不同，它会留下一个空规则行，前端从此不再播种默认配色。
> 最终还原在一个**没有前端应用**的同源页面（`/favicon.ico`）上执行：截图段的多次
> `goto('/graph')` 会让客户端把播种出来的 10 条默认规则回推服务端，在应用页面上还原等于白做。
> G110 / G111 就是这套安全网的自检（G111 在全部跳转之后再回读一次）。

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

---

## 9. 已退役的 PM2 路径（仅作历史参考）

线上早期使用 PM2 cluster + 原生 PG + Syncthing + certbot，相关痕迹：

- `/opt/digital-garden`：PM2 时代源码与 `.output`。**其 `content/vault` 仍被当前容器 bind mount**，不可删除。
- `/root/.pm2/dump.pm2`：历史 dump（PM2 当前未运行，探针里的 `pm2 list` 会意外拉起 God Daemon，用完请 `pm2 kill`）。
- `ecosystem.config.cjs`、`docker-compose.yml`（postgres + syncthing 基础编排）、`docker-compose.local.yml`（本机演示）、`nginx.conf`（服务器实际配置的副本）**已于 2026-10-06 从仓库移除**（线上均未使用；需要查阅时用 `git show <删除前的提交>:<路径>` 从历史取回）。
- `/opt/garden-src`：2026-09-24 在服务器上用 `docker build` 产出 v1.0.0 的源码树，现已弃用（服务器内存不足以再构建）。
