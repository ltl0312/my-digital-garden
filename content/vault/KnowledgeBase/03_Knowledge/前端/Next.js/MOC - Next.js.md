---
aliases: [Next.js MOC, Next.js 知识地图]
tags: [status/进行中, type/MOC, 前端/Next.js]
created: "2026-06-29"
updated: "2026-06-29"
知识体系: "前端 → L4 全栈与 SSR"
---

# MOC - Next.js

> Next.js 知识地图——React 生态的全栈 SSR/SSG 框架。覆盖框架定位、渲染模式、文件路由、项目工程化四大核心板块。| 8 篇笔记（4 知识笔记 + 4 配置指南）。

## 目录结构树

```text
前端/Next.js/
├── MOC - Next.js.md                          ← 本文件
│
├── 【知识笔记】
├── Next.js-框架概述与核心特性.md               ← 入门第一站
├── Next.js-渲染模式.md                        ← 核心竞争力
├── Next.js-文件路由系统.md                     ← 日常开发核心
├── Next.js-项目创建与核心配置.md               ← 工程化配置
│
├── 【配置指南】
├── Next.js-环境配置与项目初始化.md              ← create-next-app + 项目搭建
├── Next.js-渲染模式-环境配置.md                 ← getStaticProps/getServerSideProps 配置
├── Next.js-文件路由系统-环境配置.md              ← Pages Router + _app/_document
└── Next.js-项目创建与核心配置-环境配置.md        ← next.config.js 完整配置
```

## 分板块笔记列表

### 板块一：框架概述
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=框架概述与核心特性">Next.js 框架概述与核心特性</a> | 知识笔记 | 什么是 Next.js、8 大核心特性、为什么替代 CRA、turbopack |
| <a href="obsidian://open?file=环境配置与项目初始化">Next.js 环境配置与项目初始化</a> | 配置指南 | Node.js 验证、create-next-app、开发/构建命令 |

### 板块二：渲染模式
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=渲染模式">Next.js 渲染模式</a> | 知识笔记 | SSR/SSG/ISR/CSR 四种模式的对比、选型依据、完整代码示例 |
| <a href="obsidian://open?file=渲染模式-环境配置">Next.js 渲染模式环境配置</a> | 配置指南 | getStaticProps/getServerSideProps/getStaticPaths 参数详解 |

### 板块三：文件路由
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=文件路由系统">Next.js 文件路由系统</a> | 知识笔记 | Pages Router、Link 导航、动态路由、_app/_document、API Routes |
| <a href="obsidian://open?file=文件路由系统-环境配置">Next.js 文件路由系统环境配置</a> | 配置指南 | 推荐目录组织（pages/views 分离）、路由参数速查表 |

### 板块四：工程化配置
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=项目创建与核心配置">Next.js 项目创建与核心配置</a> | 知识笔记 | next.config.js 完整配置、自定义 webpack/Babel/PostCSS |
| <a href="obsidian://open?file=项目创建与核心配置-环境配置">Next.js 项目创建与核心配置环境配置</a> | 配置指南 | 内置工程化工具一览、性能分析 bundle-analyzer、Core Web Vitals |

## 推荐学习路径

```text
阶段一：入门（1 天）
  Next.js-框架概述与核心特性 → Next.js-环境配置与项目初始化
  理解 Next.js 是什么 + 完成项目搭建

阶段二：核心概念（2-3 天）
  Next.js-渲染模式 → Next.js-文件路由系统
  掌握四种渲染模式的选型 + 文件路由约定

阶段三：工程化（1-2 天）
  Next.js-项目创建与核心配置
  学会自定义 next.config.js、Babel、PostCSS、webpack

阶段四：进阶（后续）
  App Router + React Server Components、自定义 Server + Middleware
```

## 跨领域关联表

| 关联领域 | 关联说明 |
|---------|---------|
| <a href="obsidian://open?file=MOC - Vue3">MOC - Vue3</a> | Next.js 对标 Vue 生态的 Nuxt.js（L4 全栈与 SSR 层级） |
| <a href="obsidian://open?file=MOC - TypeScript">MOC - TypeScript</a> | Next.js 原生支持 TypeScript，类型安全的 React 开发 |
| <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a> | turbopack（Rust 编译器）的增量编译和 AST 分析 |
| <a href="obsidian://open?file=XD-3 计算机网络">XD-3 计算机网络</a> | ISR 的 stale-while-revalidate HTTP 缓存策略 |

## 标签使用统计

| 标签 | 出现次数 |
|------|---------|
| `前端/Next.js` | 8 |
| `status/进行中` | 8 |
| `type/笔记` | 4 |
| `type/教程` | 4 |

> 📂 所属：[[MOC - 前端]]
