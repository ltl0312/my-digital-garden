---
aliases: [NestJS MOC, NestJS 知识地图]
tags: [status/进行中, type/MOC, 后端/NestJS]
created: "2026-06-29"
updated: "2026-06-29"
知识体系: "Node.js 后端 / NestJS"
---

# MOC - NestJS

> NestJS 后端框架知识地图——TypeScript/Node.js 生态中架构最严谨的服务端框架。从项目初始化到数据库 CRUD，覆盖全栈后端开发所需的核心技能。| 10 篇笔记（5 知识笔记 + 5 配置指南）。

## 目录结构树

```text
后端/NestJS/
├── MOC - NestJS.md                          ← 本文件
│
├── 【知识笔记】
├── NestJS-核心架构与项目初始化.md              ← 入门第一站
├── NestJS-控制器与路由.md                     ← HTTP 请求处理
├── NestJS-模块系统.md                         ← DI 容器与模块组织
├── NestJS-请求生命周期.md                     ← AOP 切面管道
├── NestJS-TypeORM数据库集成与CRUD.md          ← 数据持久层
│
├── 【配置指南】
├── NestJS-环境配置与项目初始化.md              ← CLI + 项目搭建
├── NestJS-控制器与路由-环境配置.md              ← ValidationPipe + DTO
├── NestJS-模块系统-环境配置.md                 ← 模块组织 + DynamicModule
├── NestJS-请求生命周期-环境配置.md              ← 全局过滤器/管道/守卫
└── NestJS-TypeORM数据库集成-环境配置.md        ← TypeORM + MySQL 连接
```

## 分板块笔记列表

### 板块一：核心架构
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=核心架构与项目初始化">NestJS 核心架构与项目初始化</a> | 知识笔记 | NestJS 是什么、为什么选它、CLI 创建项目、main.ts 启动流程 |
| <a href="obsidian://open?file=环境配置与项目初始化">NestJS 环境配置与项目初始化</a> | 配置指南 | CLI 安装、项目脚手架、自定义端口、环境变量 |

### 板块二：控制器与路由
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=控制器与路由">NestJS 控制器与路由</a> | 知识笔记 | @Controller/@Get/@Post、路由参数、@Body DTO、参数装饰器全集 |
| <a href="obsidian://open?file=控制器与路由-环境配置">NestJS 控制器与路由环境配置</a> | 配置指南 | ValidationPipe 全局配置、class-validator DTO 校验 |

### 板块三：模块系统
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=模块系统">NestJS 模块系统</a> | 知识笔记 | @Module 四大属性、共享模块、@Global、动态模块 forRoot 模式 |
| <a href="obsidian://open?file=模块系统-环境配置">NestJS 模块系统环境配置</a> | 配置指南 | 模块目录组织、DynamicModule 模板、常用模块配置 |

### 板块四：请求生命周期
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=请求生命周期">NestJS 请求生命周期</a> | 知识笔记 | 中间件→守卫→管道→拦截器→控制器→过滤器 完整管道 |
| <a href="obsidian://open?file=请求生命周期-环境配置">NestJS 请求生命周期环境配置</a> | 配置指南 | 全局 ValidationPipe/ExceptionFilter/CORS 配置 |

### 板块五：数据库集成
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=TypeORM数据库集成与CRUD">NestJS TypeORM 数据库集成与 CRUD</a> | 知识笔记 | @nestjs/typeorm、Entity、Repository CRUD、Swagger 文档 |
| <a href="obsidian://open?file=TypeORM数据库集成-环境配置">NestJS TypeORM 数据库集成环境配置</a> | 配置指南 | MySQL 连接、Entity 注册、migration 替代 synchronize |

## 推荐学习路径

```text
阶段一：入门（1 天）
  NestJS-核心架构与项目初始化 → NestJS-环境配置与项目初始化
  理解 NestJS 是什么 + 完成环境搭建

阶段二：路由与模块（2-3 天）
  NestJS-控制器与路由 → NestJS-模块系统
  掌握请求处理和模块化组织

阶段三：AOP 管道（2-3 天）
  NestJS-请求生命周期
  理解请求从进入服务器到返回的完整管道

阶段四：数据持久化（3-5 天）
  NestJS-TypeORM数据库集成与CRUD
  完成从接口到数据库的完整闭环
```

## 跨领域关联表

| 关联领域 | 关联说明 |
|---------|---------|
| <a href="obsidian://open?file=MOC - Java后端">MOC - Java后端</a> | NestJS 的设计范式（@Module/@Injectable/@Controller）直接对标 Spring Boot |
| <a href="obsidian://open?file=MOC - TypeScript">MOC - TypeScript</a> | NestJS 使用 TypeScript 装饰器、类型系统作为核心语法 |
| <a href="obsidian://open?file=MySQL-InnoDB索引与MVCC详解">MySQL InnoDB</a> | TypeORM 底层连接的数据库引擎 |
| <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a> | NestJS 的模块化架构体现了 SOLID 原则和依赖注入设计模式 |

## 标签使用统计

| 标签 | 出现次数 |
|------|---------|
| `后端/NestJS` | 10 |
| `status/进行中` | 10 |
| `type/笔记` | 5 |
| `type/教程` | 5 |

> 📂 所属：[[MOC - 后端]]
