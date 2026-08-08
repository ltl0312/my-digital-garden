---
aliases: [Nuxt.js MOC, Nuxt 知识地图]
tags: [status/进行中, type/MOC, 前端/Nuxt.js]
created: "2026-06-29"
updated: "2026-06-29"
知识体系: "前端 → L4 全栈与 SSR"
---

# MOC - Nuxt.js

> Nuxt.js 知识地图——Vue 生态的全栈 SSR/SSG 框架。覆盖框架定位、路由系统、数据获取、中间件与部署四大核心板块。| 8 篇笔记（4 知识笔记 + 4 配置指南）。

## 目录结构树

```text
前端/Nuxt.js/
├── MOC - Nuxt.js.md                          ← 本文件
│
├── 【知识笔记】
├── Nuxt.js-框架概述与SSR原理.md                ← 入门第一站
├── Nuxt.js-路由系统与布局.md                   ← 日常开发核心
├── Nuxt.js-数据获取与状态管理.md               ← SSR 数据层
├── Nuxt.js-中间件插件与部署.md                  ← 进阶与运维
│
├── 【配置指南】
├── Nuxt.js-环境配置与项目初始化.md              ← create-nuxt-app + 项目搭建
├── Nuxt.js-路由系统-环境配置.md                 ← NuxtLink + layouts + 动画
├── Nuxt.js-数据获取-环境配置.md                 ← Axios + Pinia + proxy
└── Nuxt.js-部署与环境配置.md                    ← SSG/SSR/Docker/PM2
```

## 分板块笔记列表

### 板块一：框架概述
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=框架概述与SSR原理">Nuxt.js 框架概述与 SSR 原理</a> | 知识笔记 | 什么是 Nuxt、SSR 解决了什么问题、与 Vue 的关系、三种渲染模式 |
| <a href="obsidian://open?file=环境配置与项目初始化">Nuxt.js 环境配置与项目初始化</a> | 配置指南 | create-nuxt-app、项目结构、nuxt.config.js 速览 |

### 板块二：路由与布局
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=路由系统与布局">Nuxt.js 路由系统与布局</a> | 知识笔记 | 文件路由、动态路由、NuxtLink、嵌套路由、布局系统、路由动画 |
| <a href="obsidian://open?file=路由系统-环境配置">Nuxt.js 路由系统环境配置</a> | 配置指南 | NuxtLink 配置、自定义布局、全局动画 |

### 板块三：数据获取
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=数据获取与状态管理">Nuxt.js 数据获取与状态管理</a> | 知识笔记 | asyncData/useAsyncData、Axios 集成、Pinia 状态管理、并发请求 |
| <a href="obsidian://open?file=数据获取-环境配置">Nuxt.js 数据获取环境配置</a> | 配置指南 | Axios proxy 配置、Pinia 安装、数据获取决策树 |

### 板块四：中间件与部署
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=中间件插件与部署">Nuxt.js 中间件插件与部署</a> | 知识笔记 | Middleware 路由守卫、插件开发、SSG/SSR 部署、生命周期 |
| <a href="obsidian://open?file=部署与环境配置">Nuxt.js 部署与环境配置</a> | 配置指南 | PM2、Docker、SSG 到 OSS、性能优化 |

## 推荐学习路径

```text
阶段一：入门（1 天）
  Nuxt.js-框架概述与SSR原理 → Nuxt.js-环境配置与项目初始化

阶段二：核心开发（3-5 天）
  Nuxt.js-路由系统与布局 → Nuxt.js-数据获取与状态管理

阶段三：进阶与部署（1 周）
  Nuxt.js-中间件插件与部署
```

## 跨领域关联表

| 关联领域 | 关联说明 |
|---------|---------|
| <a href="obsidian://open?file=MOC - Vue3">MOC - Vue3</a> | Nuxt.js 是 Vue 生态的全栈框架，底层依赖 Vue 3 |
| <a href="obsidian://open?file=MOC - Next.js">MOC - Next.js</a> | React 生态的对应方案，同为 L4 全栈与 SSR 层级 |
| <a href="obsidian://open?file=Pinia状态管理核心设计">Pinia 状态管理</a> | Nuxt 的 Pinia 模块直接复用 Vue 3 Pinia |
| <a href="obsidian://open?file=Compose全栈部署与网络拓扑">Docker 容器部署</a> | Nuxt SSR 应用的容器化部署方案 |

## 标签使用统计

| 标签 | 出现次数 |
|------|---------|
| `前端/Nuxt.js` | 8 |
| `status/进行中` | 8 |
| `type/笔记` | 4 |
| `type/教程` | 4 |

> 📂 所属：[[MOC - 前端]]
