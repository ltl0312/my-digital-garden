# ============================================================
# 数字花园 Nuxt 4 多阶段生产镜像
# 构建：node:24-alpine（pnpm 安装 + prisma generate + nuxt build）
# 运行：node:24-alpine（生产依赖 + 迁移 + node .output/server/index.mjs）
# ============================================================

# ---- 构建阶段 ----
FROM node:24-alpine AS build
RUN npm i -g pnpm@12
WORKDIR /app

# 依赖层（利用 Docker 层缓存）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile
# prisma.config.ts 的 env('DATABASE_URL') 在 generate 时求值，需占位（generate 不实际连接；运行期由 compose 注入真实值）
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate

# 源码层
COPY . .
RUN pnpm build

# ---- 运行阶段 ----
FROM node:24-alpine AS runtime
RUN npm i -g pnpm@12
WORKDIR /app

ENV NODE_ENV=production

# 生产依赖（含 prisma CLI，供 migrate deploy；@prisma/client 运行时）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile --prod

# 构建产物与启动脚本
COPY --from=build /app/.output ./.output
COPY scripts ./scripts
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3000
CMD ["./entrypoint.sh"]
