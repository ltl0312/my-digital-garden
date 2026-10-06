#!/bin/sh
# 数字花园 · 服务器侧镜像上线脚本（版本无关，可复用）
#
# 用法（在服务器上）：
#   bash /opt/deploy-image.sh v1.9.1
# 前置：镜像 tar 已上传到 /opt/garden-image-<版本>.tar（本地 docker save 产出）
#
# 流程与 DEPLOY.md §3–§5 一致：备份编排与 .env → 记录回滚点 → load → 重建 → 轮询就绪 → 验证。
# 幂等：重复执行同一版本只是再次 load + 重建，无副作用（entrypoint 的 migrate deploy 也是幂等的）。
set -e

VER="$1"
if [ -z "$VER" ]; then
  echo "用法: bash /opt/deploy-image.sh <版本号，如 v1.9.1>"
  exit 1
fi

TAR="/opt/garden-image-${VER}.tar"
if [ ! -f "$TAR" ]; then
  echo "找不到镜像归档：$TAR"
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
BK=/opt/garden-backup
mkdir -p "$BK"

echo "=== 1) 备份当前编排与 .env（回滚用） ==="
cp -a /opt/garden-docker/docker-compose.prod.yml "$BK/docker-compose.prod.yml.$STAMP"
cp -a /opt/garden-docker/.env "$BK/env.$STAMP"
chmod 600 "$BK"/env.* 2>/dev/null || true
echo "备份时间戳: $STAMP"

echo "=== 2) 记录回滚点（当前运行容器的镜像 ID） ==="
docker inspect garden-app --format '{{.Image}}' | tee "$BK/rollback-image-id.$STAMP.txt"
echo "--- 载入前已有镜像 ---"
docker images my-digital-garden-app --format '{{.Tag}} {{.ID}}'

echo "=== 3) docker load $VER ==="
docker load -i "$TAR"

echo "=== 4) 载入后镜像列表（确认 latest 指向新 ID，旧 vX.Y.Z 仍在） ==="
docker images my-digital-garden-app --format '{{.Tag}} {{.ID}} {{.Size}}' | head -6

echo "=== 5) 重建容器 ==="
cd /opt/garden-docker
docker compose -f docker-compose.prod.yml up -d --force-recreate

echo "=== 6) 等待就绪（最多 120 秒；entrypoint 会先跑 prisma migrate deploy） ==="
i=0
code=000
while [ $i -lt 60 ]; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login || echo 000)
  if [ "$code" = "200" ]; then echo "就绪：第 $i 次探测返回 200"; break; fi
  i=$((i+1))
  sleep 2
done
echo "最终探测 HTTP: $code"

echo "=== 7) 容器状态 ==="
docker ps --filter name=garden-app

echo "=== 8) 容器日志（尾部 25 行） ==="
docker logs --tail 25 garden-app

echo "=== 9) 资源占用 ==="
docker stats --no-stream garden-app || true
free -m | head -2

echo "=== 完成：$VER ==="
