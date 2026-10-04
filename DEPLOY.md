# 数字花园 · 生产部署手册（Docker）

> 目标环境：阿里云 ECS `8.163.35.246`（Alibaba Cloud Linux 4，2 核 / 1.6G 内存 / 40G）
> 技术栈：Nuxt 4（Nitro 生产产物）+ PostgreSQL（**宿主原生**）+ Docker + Nginx + acme.sh
> 线上域名：`https://liutianle.cn`
>
> 最后核实：2026-10-04。**线上由 Docker 容器承载，PM2 未在运行**（历史 PM2 路径见 §9）。

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
| `latest` / `v1.4.0` | `f41e416de9b6` | 图谱：控制面板批量上色（按路径/名称/正文圈选）、自定义颜色按用户同步（**当前**） |
| `v1.3.0` | `b8a194bd4f43` | 图谱：缩略图重绘并着色、连线加深、节点自定义颜色、左栏可收起、右键菜单 |
| `v1.2.0` | `ec68377534dd` | 图谱：MOC 标签策略、聚焦斥力、控制面板、页面标题 |
| `v1.1.0` | `1c983fe652b1` | 图谱三区重构 |
| `v1.0.0` | `36800e565796` | 重构前基线 |

服务器上现存的镜像归档：`/opt/garden-image-v1.2.0.tar`、`/opt/garden-image-v1.3.0.tar`、`/opt/garden-image-v1.4.0.tar`（v1.1.0 的 `garden-image-new.tar` 已删）。

> **v1.4.0 起有 schema 变更**：新增 `GraphColor` 表（迁移 `20261001000000_graph_colors`），由 `entrypoint.sh` 的 `prisma migrate deploy` 在启动时自动应用。**回滚到 v1.3.0 及更早版本时该表会被保留但不再被读取**（老代码不认识它），无需手动 drop；反过来从老版本升到 v1.4.0 也不需要预操作。

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
pnpm acceptance:graph     # 图谱重构 46 项，纯只读
pnpm acceptance:shell     # 外壳 47 项，只开对话框不提交
pnpm acceptance:ui        # UI 51 项，只开对话框不提交
```

> 🚫 **`pnpm acceptance:api`（`e4-regression.mjs`）绝不能对生产跑**：它会 POST `/api/admin/keys`、POST `/api/vault/folders`、POST `/api/vault/notes`、PUT `/api/vault/rename`、POST `/api/vault/copy`，并 DELETE `/api/vault/nodes`（含 `KnowledgeBase/03_Knowledge`）——**会真实改动生产数据**。

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
- `ecosystem.config.cjs`、`docker-compose.yml`（postgres + syncthing 基础编排）、`docker-compose.local.yml`（本机演示）仍在仓库中，但**线上均未使用**。
- `/opt/garden-src`：2026-09-24 在服务器上用 `docker build` 产出 v1.0.0 的源码树，现已弃用（服务器内存不足以再构建）。
