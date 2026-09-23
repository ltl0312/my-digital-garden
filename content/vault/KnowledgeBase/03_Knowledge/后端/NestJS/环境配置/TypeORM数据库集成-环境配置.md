---
aliases: [NestJS TypeORM 配置, NestJS MySQL 配置, NestJS 数据库连接配置]
tags:
  - status/进行中
  - type/教程
  - 后端/NestJS
created: "2026-06-29 11:10"
updated: "2026-06-29 11:10"
source: "https://docs.nestjs.com/techniques/database"
知识体系: "Node.js 后端 / NestJS → L3 数据库集成"
技术版本: "NestJS 10.x / TypeORM 0.3.x / MySQL 8.0"
---

# NestJS — TypeORM 数据库集成环境配置

> 本指南聚焦于 TypeORM + MySQL 的环境搭建。基础安装请参考 <a href="obsidian://open?file=环境配置与项目初始化">NestJS 环境配置与项目初始化</a>。

## 信息来源
- **官方文档**：https://docs.nestjs.com/techniques/database （✅ 可访问）
- **TypeORM 文档**：https://typeorm.io/ （✅ 可访问）

## 前置条件
- MySQL 8.0+ 已安装并运行
- NestJS 项目已初始化

## Step 1: 安装依赖

```bash
# 方式一：@nestjs/typeorm（推荐）
npm i @nestjs/typeorm typeorm mysql2 @nestjs/config -S

# 方式二：直接使用 typeorm
npm i typeorm mysql2 dotenv -S
```

## Step 2: 配置环境变量（.env）

```ini
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWD=your_password
DB_DATABASE=blog
```

## Step 3: 配置数据库连接（app.module.ts）

```typescript
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService, ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get('DB_USER', 'root'),
        password: configService.get('DB_PASSWORD', 'root'),
        database: configService.get('DB_DATABASE', 'blog'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],  // ② 自动扫描 entity
        timezone: '+08:00',
        synchronize: true,   // ⚠️ 生产环境必须设为 false
        logging: true,       // 开发环境开启 SQL 日志
      }),
    }),
  ],
})
export class AppModule {}
```

## Step 4: 创建 Entity 与 CRUD

```bash
nest g resource user
```

使用 `TypeOrmModule.forFeature([User])` 在功能模块中注册 Entity。

## Step 5: 创建数据库

```sql
CREATE DATABASE blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 核心配置项说明

| 配置项 | 默认值 | 推荐值（开发） | 推荐值（生产） |
|--------|--------|---------------|---------------|
| `type` | — | `mysql` | `mysql` |
| `host` | — | `localhost` | 环境变量注入 |
| `port` | `3306` | `3306` | 环境变量注入 |
| `synchronize` | `false` | `true`（自动建表） | **`false`**（必须！） |
| `logging` | `false` | `true` | `false` 或 `['error']` |
| `timezone` | 系统时区 | `+08:00` | `+08:00` |
| `entities` | `[]` | 自动扫描或手动注册 | 自动扫描 |

## 常见问题

### 问题 1：`ER_NOT_SUPPORTED_AUTH_MODE`（MySQL 8.0 认证问题）
```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password';
FLUSH PRIVILEGES;
```

### 问题 2：Entity 未注册导致 `RepositoryNotFoundError`
- **解决**：确认 Entity 已加入 `TypeOrmModule.forFeature()` 和 `entities` 数组

### 问题 3：`synchronize: true` 生产环境删表
- **解决**：生产环境务必设 `synchronize: false`，改用 TypeORM Migration 管理表结构变更

> 📂 所属：[[MOC - NestJS]]
