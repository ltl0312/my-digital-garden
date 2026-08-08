---
aliases: [Docker Compose, 容器编排, Docker网络, 全栈部署, 虚拟内网]
tags:
  - status/进行中
  - type/笔记
  - 运维/Docker
created: "2026-06-16 12:30"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java全栈开发实战笔记(SpringBoot+Vue3).md"
知识体系: "DevOps/运维 → L1 容器化"
技术版本: "Docker 24+ / Compose v2"
---

# Docker Compose 全栈部署与网络拓扑

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：DevOps/运维
- **所在层级**：DevOps/运维 → L1 容器化
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> Docker Compose 通过一个 YAML 文件定义并启动多个互相隔离的容器。在全栈架构中，利用 Docker 虚拟内网实现"前端唯一对外暴露 → 后端+数据库+缓存全部藏在内网"的安全网络拓扑。

---

## 一、Docker Compose 网络拓扑全景

```
                     ┌─────────────────────────────┐
                     │  宿主机 (Host Machine)       │
                     │                              │
      用户浏览器 ─────│→ 80 端口 ─→ Nginx 容器     │  ← 唯一对公网暴露！
                     │    (frontend)               │
                     │        │                    │
                     │        │ 内网 DNS 转发       │
                     │        ▼                    │
                     │   backend:8080              │  ← 虚拟内网域名
                     │   (Spring Boot 容器)         │
                     │    │           │            │
                     │    │           │            │
                     │    ▼           ▼            │
                     │   mysql:3306  redis:6379    │  ← 数据库永远不对外暴露！
                     │   (MySQL)     (Redis)        │
                     │                              │
                     └─────────────────────────────┘

网络隔离规则：
  80 端口     → 公网 → Nginx 容器（唯一出口）
  mysql:3306  → 仅 Docker 内网可访问（公网不可达）
  redis:6379  → 仅 Docker 内网可访问（公网不可达）
  backend:8080 → 仅 Docker 内网可访问（公网不可达）
```

---

## 二、完整 docker-compose.yml 解析

```yaml
version: '3.8'

# ======== 声明隔离内网 =========
networks:
  app-network:
    driver: bridge          # 桥接模式：容器间通过虚拟交换机通信

services:
  # ======== MySQL 节点 =========
  mysql:
    image: mysql:8.0.32      # 指定精确版本，避免 latest 的不确定性
    container_name: boot_mysql
    restart: always           # 崩溃自动重启
    environment:
      MYSQL_ROOT_PASSWORD: mySecurePassword123
      MYSQL_DATABASE: app_db
      TZ: Asia/Shanghai      # 时区同步
    volumes:
      - ./data/mysql:/var/lib/mysql   # ← 数据持久化！否则容器删除数据全丢
    networks:
      - app-network
    # ← 无 ports 映射！不暴露到宿主机，仅内网可达

  # ======== Redis 节点 =========
  redis:
    image: redis:7.0-alpine  # alpine 版本极小（~30MB）
    container_name: boot_redis
    restart: always
    command: redis-server --requirepass secureRedisPwd --appendonly yes
    #         │                  │                        └── AOF 持久化开启
    #         │                  └── 设置密码（生产必须！）
    #         └── 启动 Redis 服务
    volumes:
      - ./data/redis:/data
    networks:
      - app-network

  # ======== Spring Boot 业务节点 =========
  backend:
    build: ./backend          # 从 Dockerfile 构建镜像
    container_name: boot_backend
    restart: always
    depends_on:               # 启动顺序：等 MySQL 和 Redis 先启动
      - mysql
      - redis
    environment:
      # 通过环境变量动态注入内网 DNS，覆盖 application.yml
      # mysql 和 redis 就是上面的服务名（Docker 内网 DNS 解析）
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/app_db?serverTimezone=Asia/Shanghai
      SPRING_REDIS_HOST: redis
      SPRING_REDIS_PASSWORD: secureRedisPwd
    networks:
      - app-network

  # ======== Nginx 前端节点 =========
  frontend:
    image: nginx:1.24-alpine
    container_name: boot_frontend
    restart: always
    ports:
      - "80:80"              # ← 整个架构唯一对外的端口映射！
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro   # 挂载前端构建产物（只读）
      - ./config/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
    networks:
      - app-network
```

---

## 三、Docker 内网 DNS：服务名即域名

```
Docker Compose 自动创建的 DNS 解析：

backend 容器内执行：ping mysql
  → Docker DNS 自动将 "mysql" 解析为 MySQL 容器的内网 IP (172.18.0.x)

这意味着：
  application.yml 中的 jdbc:mysql://localhost:3306 ← 在容器内 "localhost" 指向容器自己！
  必须改为 jdbc:mysql://mysql:3306 ← "mysql" 是 Docker DNS 的服务名

生产中：
  用环境变量覆盖 application.yml → SPRING_DATASOURCE_URL=jdbc:mysql://mysql:3306/app_db
```

---

## 四、常用 Docker Compose 命令

```bash
# 启动所有服务（后台运行，-d = detached）
docker compose up -d

# 查看运行状态
docker compose ps

# 查看日志
docker compose logs -f          # -f 持续跟踪
docker compose logs backend     # 只看 backend 日志

# 重新构建并启动（代码改了之后）
docker compose up -d --build

# 停止所有服务（不删除容器）
docker compose stop

# 停止并删除所有容器+网络
docker compose down

# 停止并删除容器+网络+数据卷（⚠️ 数据库数据会丢！）
docker compose down -v
```

---

## 五、Dockerfile 示例（Spring Boot）

```dockerfile
# ===== 多阶段构建：构建阶段 =====
FROM maven:3.9-eclipse-temurin-17-alpine AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

# ===== 多阶段构建：运行阶段 =====
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

> **多阶段构建的优势**：构建阶段用的 Maven 没必要被打进最终镜像，最终镜像只含 JRE + jar，体积大幅缩小。

---

## 关联上下文
- **前置知识**：📋 待补充：Docker基础概念 理解镜像、容器、卷的基础操作
- **横向对比**：📋 待补充：Docker Compose vs Kubernetes vs Docker Swarm Compose 适合单机多容器编排，K8s 适合集群
- **实际应用**：📋 待补充：全栈项目本地开发环境搭建 用 Compose 一键启动前端+后端+数据库+缓存
- **进阶方向**：📋 待补充：Docker Swarm集群部署 从单机 Compose 扩展到多机集群
- **易混淆概念**：📋 待补充：docker-compose.yml vs Dockerfile Compose 编排多容器，Dockerfile 构建单镜像
- **Nginx 网关**：Nginx 容器的 `proxy_pass http://backend:8080/` 正是利用 Docker 内网 DNS 解析，详见 <a href="obsidian://open?file=Nginx网关配置与SPA刷新问题">Nginx网关配置与SPA刷新问题</a>
- **MySQL 持久化**：`/var/lib/mysql` 的卷挂载是防止容器删除后数据丢失的关键
- **环境变量注入**：`SPRING_DATASOURCE_URL` 覆盖应用配置是 12-Factor App 的核心实践

> 📂 所属：[[MOC - 运维]]
