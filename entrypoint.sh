#!/bin/sh
set -e

echo "[garden] 等待数据库就绪..."
# 迁移重试（postgres 容器冷启动需要时间）
ATTEMPTS=0
until npx prisma migrate deploy; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 10 ]; then
    echo "[garden] 数据库迁移失败，请检查 DATABASE_URL 与 postgres 容器状态"
    exit 1
  fi
  echo "[garden] 数据库未就绪，5 秒后重试 ($ATTEMPTS/10)..."
  sleep 5
done

echo "[garden] 迁移完成，启动应用..."
exec node .output/server/index.mjs
