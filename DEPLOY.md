# 数字花园 · 本地到云服务器一键部署手册

> 目标环境：Ubuntu 22.04 LTS 云服务器（开放 80、443、8384、22000、21027 端口）
> 技术栈：Nuxt 4（Nitro 生产产物）+ PostgreSQL 18 + Syncthing + PM2 + Nginx + Certbot

---

## 0. 前置条件

| 位置 | 要求 |
|---|---|
| 本地 | Node ≥ 20.19、pnpm ≥ 8、Obsidian（写作端） |
| 云服务器 | Ubuntu 22.04、Node ≥ 20.19、pnpm、Docker + Compose V2、PM2、Nginx、Certbot |
| 域名 | 已解析至服务器 IP（如 `your-garden-domain.com`） |

服务器环境准备：

```bash
# Node 20.x（含 pnpm）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo corepack enable && corepack prepare pnpm@latest --activate
sudo npm i -g pm2

# Docker + Compose V2
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # 重新登录生效

# Certbot
sudo apt-get install -y certbot python3-certbot-nginx
```

---

## 1. 本地打包

> **重要：** `.output` 依赖 pnpm 符号链接结构，**不可从 Windows 直接拷贝到 Linux 运行**（依赖解析会断裂）。生产构建必须在服务器（Linux）上执行。本地仅做产物正确性验证。

本地验证构建：

```bash
pnpm build          # 产物 .output/，本地验证无 error
```

（可选）本地 Linux 容器等价验证：

```bash
# Docker Desktop 可用时，将 .output 复制进容器并重建依赖后运行
docker run -d --name garden-preview -p 3100:3000 -w /app node:20-alpine sleep infinity
docker cp .output garden-preview:/app/.output
docker cp content garden-preview:/app/content
docker exec garden-preview sh -c "cd /app/.output/server && npm install --omit=dev --no-audit --no-fund"
docker exec -d garden-preview env NODE_ENV=production DATABASE_URL="postgresql://postgres:密码@host.docker.internal:5432/digital_garden?schema=public" node .output/server/index.mjs
curl http://localhost:3100/   # 应返回 200
```

准备部署包（**源码而非产物**，服务器上重新构建）：

```bash
mkdir -p dist-deploy && cd dist-deploy
git clone <你的仓库地址> .   # 或 rsync 项目源码（排除 node_modules/.output/.nuxt/.env）
# 确认包含：package.json、pnpm-lock.yaml、nuxt.config.ts、app/、server/、
#            prisma/（schema + migrations）、prisma.config.ts、content/、
#            docker-compose.yml、ecosystem.config.js、nginx.conf
tar czf digital-garden-src.tar.gz .
```

---

## 2. 服务器初始化

```bash
sudo mkdir -p /opt/digital-garden
sudo chown $USER:$USER /opt/digital-garden
cd /opt/digital-garden

# 解压源码包
tar xzf digital-garden-src.tar.gz

# 关键：创建 vault 目录（watcher 监听路径，生产环境同样运行，缺失会导致监听失败）
mkdir -p content/vault
sudo ln -s /opt/digital-garden/content/vault /var/vault   # 与 Syncthing 容器共享同一目录

# 安装依赖（含 prisma CLI，供生产迁移；生产构建在服务器完成）
pnpm install
```

配置生产环境变量：

```bash
cat > .env <<'EOF'
DATABASE_URL="postgresql://garden_user:SecureProdPassword987!@localhost:5432/garden_db?schema=public"
PORT=3000
EOF
```

---

## 3. 数据层编排（Docker Compose）

```bash
cd /opt/digital-garden
docker compose up -d
docker ps                      # garden-db 与 garden-syncthing 均 Up
docker compose logs postgres   # 确认 "database system is ready to accept connections"
```

> 生产前请将 `docker-compose.yml` 中的 `POSTGRES_PASSWORD` 与 `ecosystem.config.js` 的 `DATABASE_URL` 改为强密码（两处保持一致），建议通过 `.env` 文件注入。

---

## 4. 数据库迁移

```bash
cd /opt/digital-garden
npx prisma migrate deploy      # 应用 prisma/migrations/ 中全部迁移（勿用 migrate dev）
npx prisma migrate status      # 应输出 Database schema is up to date!
```

---

## 5. 生产构建与 PM2 托管

```bash
cd /opt/digital-garden
pnpm build                     # 在 Linux 上构建（关键：勿跨平台搬运 .output）
pm2 start ecosystem.config.js  # Cluster 模式，instances: max
pm2 save && pm2 startup        # 开机自启（按提示执行 sudo 命令）
pm2 status                     # digital-garden 应为 online
pm2 logs digital-garden        # 确认 [garden] watcher 监听日志无 error
curl http://localhost:3000/    # 本机应返回 200
```

---

## 6. Nginx 反向代理与 HTTPS

```bash
sudo cp nginx.conf /etc/nginx/sites-available/garden.conf
sudo ln -s /etc/nginx/sites-available/garden.conf /etc/nginx/sites-enabled/
sudo sed -i 's/your-garden-domain.com/你的真实域名/g' /etc/nginx/sites-available/garden.conf
sudo nginx -t && sudo systemctl reload nginx

# 签发 SSL 证书（certbot 自动改写 nginx 配置并启用 HTTPS）
sudo certbot --nginx -d your-garden-domain.com
```

---

## 7. Syncthing 双向同步配对

1. 访问 `http://<服务器IP>:8384`（首次建议 `ssh -L 8384:localhost:8384 <服务器>` 隧道访问，避免暴露公网）
2. 在 Syncthing Web UI 添加同步文件夹 `/var/syncthing/Vault`（即宿主机 `/var/vault`，即 `/opt/digital-garden/content/vault`）
3. 在本地 Obsidian 中：将本地 vault 目录与服务器设备配对（扫码或设备 ID 互认）
4. 首次全量同步后，服务器 watcher 自动将全部笔记写入 PostgreSQL

---

## 8. 验收清单

- [ ] `https://your-garden-domain.com/` 返回首页（花园最近更新）
- [ ] `https://your-garden-domain.com/notes/<slug>` 可访问既有笔记（含反向链接卡片）
- [ ] `https://your-garden-domain.com/graph` 图谱页渲染节点与边
- [ ] 本地 Obsidian 新建/修改笔记 → **秒级同步** → 线上 `/notes/<新slug>` 立即可访问
- [ ] 暗黑模式切换与持久化正常
- [ ] `pm2 status` 全部 online；`pm2 logs` 无 error

---

## 9. 运维速查

| 操作 | 命令 |
|---|---|
| 重启应用 | `pm2 restart digital-garden` |
| 查看应用日志 | `pm2 logs digital-garden` |
| 重启数据容器 | `docker compose restart` |
| 查看 Nginx 日志 | `sudo journalctl -u nginx -f` |
| 数据库备份 | `docker exec garden-db pg_dump -U garden_user garden_db > backup.sql` |
| 数据库恢复 | `docker exec -i garden-db psql -U garden_user garden_db < backup.sql` |
| 更新部署 | 拉取新源码 → `pnpm install && npx prisma migrate deploy && pnpm build && pm2 restart digital-garden` |

---

## 10. 已知平台限制（实测记录）

1. **Windows 本地直接运行 `.output`**：Nitro 打包将 `import.meta.url` 替换为占位 `file:///_entry.js`，Prisma 7 客户端生成的 `__dirname` shim 在 Windows 上调用 `fileURLToPath` 会抛 `ERR_INVALID_FILE_URL_PATH`；Linux 上该占位路径合法，**生产不受影响**。
2. **pnpm 符号链接跨平台断裂**：Windows 构建的 `.output/server/node_modules` 使用 pnpm 链接结构，迁移到 Linux 后依赖解析失败（如 `postgres-array` 缺失）。**务必在服务器（Linux）上执行 `pnpm build`**。
3. 生产环境建议使用 Node ≥ 20.19（Nuxt 4 要求）。
