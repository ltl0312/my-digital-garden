---
aliases: [Vue3 MOC, Vue 知识地图]
tags: [status/进行中, type/MOC, 前端/Vue]
created: "2026-06-16 22:30"
updated: "2026-06-16 22:30"
知识体系: "前端 → L1 框架核心"
---

# MOC - Vue3

> <a href="obsidian://open?file=MOC - 前端">MOC - 前端</a> > **Vue 3** | 13 篇笔记。L1-L2 框架核心 + 构建与状态。

## 目录结构

```
Vue3/
├── MOC - Vue3.md
├── Vue3-响应式引擎与CompositionAPI.md       (L1)
├── Vue3-模板语法与指令.md                    (L1)
├── Vue3-模板语法-环境配置与项目初始化.md
├── Vue3-组件通信与插槽.md                    (L1)
├── Vue3-组件通信-环境配置与项目初始化.md
├── Vue3-样式与CSS特性.md                     (L1)
├── Vue3-样式与CSS-环境配置与项目初始化.md
├── Vue3-内置组件.md                          (L1)
├── Vue3-内置组件-环境配置与项目初始化.md
├── Vue3-异步组件与自定义指令.md              (L1)
├── Vue3-异步组件-环境配置与项目初始化.md
├── Vite构建工具原理与优势.md                 (L2)
└── Pinia状态管理核心设计.md                  (L2)
```

## 笔记列表

| 笔记                                                                                     | 简介                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| <a href="obsidian://open?file=响应式引擎与CompositionAPI">Vue3-响应式引擎与CompositionAPI</a> | Proxy 响应式、ref/reactive/computed/watch、生命周期、defineModel |
| <a href="obsidian://open?file=模板语法与指令">Vue3-模板语法与指令</a>                           | v-bind/v-on/v-model/v-if/v-for、修饰符                     |
| <a href="obsidian://open?file=组件通信与插槽">Vue3-组件通信与插槽</a>                           | defineProps/Emits、defineModel、具名/作用域插槽、provide/inject  |
| <a href="obsidian://open?file=样式与CSS特性">Vue3-样式与CSS特性</a>                         | scoped、:deep()、CSS Modules、v-bind() in CSS             |
| <a href="obsidian://open?file=内置组件">Vue3-内置组件</a>                                 | Transition/KeepAlive/Teleport/Suspense/component :is   |
| <a href="obsidian://open?file=异步组件与自定义指令">Vue3-异步组件与自定义指令</a>                     | defineAsyncComponent、自定义指令、app.use()                   |
| <a href="obsidian://open?file=Vite构建工具原理与优势">Vite构建工具原理与优势</a>                         | ESM 原生模块、No-Bundle、HMR                                 |
| <a href="obsidian://open?file=Pinia状态管理核心设计">Pinia状态管理核心设计</a>                         | Store 定义、响应式状态与 Action                                 |

## 学习路径

响应式引擎 → 模板语法 → 组件通信 → 样式 → 内置组件 → 异步组件 → Vite → Pinia

## 跨领域关联

| 概念                  | 关联                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Vue 3 Proxy 响应式     | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a> — 元编程/反射 → <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a> — 观察者模式 |
| Vite ESM 构建         | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a> — ES Module 静态分析 → Tree Shaking                                                 |
| v-memo 缓存           | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> — 记忆化 Memoization                                                               |
| `<script setup>` 编译 | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a> — 编译时语法糖 (parse → transform → generate)                                         |

## 标签统计

| 标签 | 频次 |
|------|------|
| `前端/Vue` | 11 |
| `type/笔记` | 8 |
| `type/教程` | 5 |

> 📂 所属：[[MOC - 前端]]
