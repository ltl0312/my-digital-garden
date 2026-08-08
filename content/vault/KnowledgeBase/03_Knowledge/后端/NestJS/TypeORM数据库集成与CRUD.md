---
aliases: [NestJS TypeORM, NestJS MySQL, NestJS 数据库 CRUD, @nestjs/typeorm]
tags:
  - status/进行中
  - type/笔记
  - 后端/NestJS
created: "2026-06-29 11:10"
updated: "2026-06-29 11:10"
source: "https://juejin.cn/post/7432778708269170738"
知识体系: "Node.js 后端 / NestJS → L3 数据库集成"
技术版本: "NestJS 10.x / TypeORM 0.3.x / MySQL 8.0"
---

# NestJS TypeORM 数据库集成与 CRUD

## 📍 知识体系定位
- **所属技术栈**：后端（Node.js 生态）
- **所在层级**：NestJS 框架 → 数据持久层
- **上游依赖**：<a href="obsidian://open?file=模块系统">NestJS 模块系统</a> — 数据库连接通过动态模块（forRootAsync）集成到 DI 容器
- **下游延伸**：Swagger 接口文档 — 为 CRUD 接口生成 API 文档
- **同级技术**：Prisma（新一代 ORM），Spring Data JPA + Hibernate（Java 对应方案）

## 概述（Overview）
> TypeORM 是 Node.js 生态中老牌的 ORM（对象关系映射）框架，用 TypeScript 编写，在 NestJS 框架下运行得非常好。它可以通过 `@nestjs/typeorm` 集成包的开箱即用支持，将数据库操作无缝融入 NestJS 的依赖注入体系。

## 设计初衷（Motivation）

### 为什么 TypeORM 是 NestJS 首选
1. **TypeScript 原生**：实体定义、Repository 类型推断全部类型安全
2. **装饰器 API**：`@Entity()`、`@Column()`、`@PrimaryGeneratedColumn()` 直接映射 NestJS 的装饰器风格
3. **开箱即用包**：`@nestjs/typeorm` 提供 `TypeOrmModule.forRoot()` 和 `TypeOrmModule.forFeature()` 两个方法，完美融入模块系统
4. **多数据源支持**：MySQL、PostgreSQL、SQLite、MSSQL 等

---

## 实现（Implementation）

### 前置条件：环境配置

```bash
# 1. 安装依赖
npm i @nestjs/config -S       # 环境变量管理

# 2. 在 app.module.ts 中注册 ConfigModule
```

```typescript
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule.forRoot(), UserModule],
    // ...
})
export class AppModule {}
```

NestJS 使用 `@nestjs/config` 会默认从项目根目录载入并解析 `.env` 文件。

---

### 方式一：使用 `@nestjs/typeorm` 连接数据库（推荐）

```bash
# 安装依赖
npm i @nestjs/typeorm typeorm mysql2 -S
```

#### `.env` 文件配置

```ini
DB_HOST=localhost      # 数据库地址
DB_PORT=3306           # 数据库端口
DB_USER=root           # 数据库登录名
DB_PASSWD=root         # 数据库登录密码
DB_DATABASE=blog       # 数据库名字
```

#### `app.module.ts` 中连接数据库

```typescript
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({       // ② 异步配置数据库连接
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        type: 'mysql',                                           // 数据库类型
        entities: [],                                            // 数据表实体
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get('DB_USER', 'root'),
        password: configService.get('DB_PASSWORD', 'root'),
        database: configService.get('DB_DATABASE', 'blog'),
        timezone: '+08:00',                                      // 时区
        synchronize: true,  // ② ⚠️ 根据实体自动建表，生产环境建议关闭！
      }),
    }),
    UserModule
  ],
})
export class AppModule {}
```

> ⚠️ **版本兼容性**：`synchronize: true` 在开发环境方便快速迭代，但生产环境必须关闭（`false`），否则可能意外删除数据列。

---

### 方式二：直接使用 `typeorm`，自由封装 Providers

```bash
npm i typeorm mysql2 -S
npm i dotenv --save-dev
```

创建 `database.providers.ts`：

```typescript
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

const databaseType: DataSourceOptions['type'] = 'mysql';
const envConfig = dotenv.config().parsed;

const DATABASE_CONFIG = {
    ...envConfig,
    type: databaseType,
    entities: [],
};

const MYSQL_DATA_SOURCE = new DataSource(DATABASE_CONFIG);

// ② 数据库注入提供者
export const DatabaseProviders = [
    {
        provide: 'MYSQL_DATA_SOURCE',
        useFactory: async () => {
            await MYSQL_DATA_SOURCE.initialize();
            return MYSQL_DATA_SOURCE;
        }
    }
];
```

创建 `database.module.ts`：

```typescript
import { Module } from '@nestjs/common';
import { DatabaseProviders } from './database.providers';

@Module({
    providers: [...DatabaseProviders],
    exports: [...DatabaseProviders],
})
export class DatabaseModule {}
```

---

### CRUD 完整示例

#### Step 1: 创建 User Entity

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('user')                       // ② 对应数据库中的 user 表
export class User {
    @PrimaryGeneratedColumn()         // ② 主键，值自动生成
    id: number;

    @Column({ default: null })        // ② name 列，默认值为 null
    name: string;

    @Column({ type: 'timestamp', default: () => "CURRENT_TIMESTAMP" })
    create_time: Date;

    @Column({ type: 'timestamp', default: () => "CURRENT_TIMESTAMP" })
    update_time: Date;
}
```

#### Step 2: UserService 实现 CRUD

```typescript
import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)                          // ② 注入 User Repository
        private readonly userRepository: Repository<User>,
    ) {}

    async create(createUserDto: Partial<User>): Promise<User> {
        const { name } = createUserDto;
        if (!name) {
            throw new HttpException('名字不能为空', 401);
        }
        // ② 检查名称重复
        const userInfo = await this.userRepository.findOne({ where: { name } });
        if (userInfo) {
            throw new HttpException('名称不能重复', 401);
        }
        return await this.userRepository.save(createUserDto);
    }

    async findById(id): Promise<User> {
        return await this.userRepository.findOne({ where: { id } });
    }

    async updateById(id, user): Promise<User> {
        const existUser = await this.userRepository.findOne({ where: { id } });
        if (!existUser) {
            throw new HttpException('用户不存在', 401);
        }
        // ② merge() 将更新数据合并到已有实体
        const updateUser = this.userRepository.merge(existUser, user);
        return this.userRepository.save(updateUser);
    }

    async remove(id) {
        const existUser = await this.userRepository.findOne({ where: { id } });
        if (!existUser) {
            throw new HttpException('用户不存在', 401);
        }
        return await this.userRepository.remove(existUser);
    }
}
```

#### Step 3: UserModule 注册

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { User } from './entities/user.entity';

@Module({
    imports: [TypeOrmModule.forFeature([User])],  // ② 注册该模块使用的 Entity
    controllers: [UserController],
    providers: [UserService],
})
export class UserModule {}
```

#### Step 4: UserController 路由

```typescript
import { Controller, Get, Post, Body, Param, Delete, Put } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Post()
    async create(@Body() createUserDto) {
        return await this.userService.create(createUserDto);
    }

    @Get(':id')
    async findById(@Param('id') id: string) {
        return await this.userService.findById(id);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() updateUserDto) {
        return await this.userService.updateById(id, updateUserDto);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return await this.userService.remove(id);
    }
}
```

> **💡 补充**：在创建完 Entity 后，必须将对应的 Entity 加到 `app.module.ts` 的 `TypeOrmModule.forRootAsync()` 中的 `entities` 数组，TypeORM 才能识别并映射。

### Swagger 接口文档

```bash
npm i @nestjs/swagger -S
```

创建 `doc.ts`：

```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as packageConfig from '../package.json';

export const generateDocument = (app) => {
    const options = new DocumentBuilder()
        .setTitle(packageConfig.name)             // ② 从 package.json 读取信息
        .setDescription(packageConfig.description)
        .setVersion(packageConfig.version)
        .build();

    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('/api/doc', app, document);  // ② 文档地址：/api/doc
};
```

> 需要在 `tsconfig.json` 中新增 `"resolveJsonModule": true` 以允许导入 `.json` 模块。

在 `main.ts` 中引入：

```typescript
import { generateDocument } from './doc';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    generateDocument(app);                          // ② 注册 Swagger 文档
    await app.listen(process.env.PORT ?? 3000);
}
```

在 Controller 中使用 `@ApiTags` 给接口分组：

```typescript
import { ApiTags } from '@nestjs/swagger';

@ApiTags('用户')          // ② Swagger 中的接口分组标签
@Controller('user')
export class UserController { /* ... */ }
```

## 关联上下文
- **前置知识**：<a href="obsidian://open?file=模块系统">NestJS 模块系统</a> — TypeOrmModule.forRootAsync() 是动态模块的经典应用
- **横向对比**：<a href="obsidian://open?file=MySQL-InnoDB索引与MVCC详解">MySQL InnoDB</a> — TypeORM 底层连接的 MySQL 数据库引擎
- **实际应用**：<a href="obsidian://open?file=请求生命周期">NestJS 请求生命周期</a> — 数据库异常通过异常过滤器统一捕获并返回
- **进阶方向**：TypeORM 迁移、QueryBuilder 复杂查询、事务管理
- **易混淆概念**：`@nestjs/typeorm` vs 直接使用 `typeorm` — 前者融入 DI 容器（推荐），后者自由封装（灵活但须手动管理生命周期）

> 📂 所属：[[MOC - NestJS]]
