---
aliases: [前端 MOC, Frontend MOC, 前端知识地图]
tags:
  - status/进行中
  - type/MOC
  - 前端
created: "2026-06-16 19:03"
updated: "2026-06-29"
知识体系: "前端"
---

# MOC - 前端

> 本 MOC 覆盖前端技术栈，按 roadmap.sh 组织。下设 6 个子 MOC：<a href="obsidian://open?file=MOC - HTML5">MOC - HTML5</a> / <a href="obsidian://open?file=MOC - CSS3">MOC - CSS3</a> / <a href="obsidian://open?file=MOC - JavaScript">MOC - JavaScript</a> / <a href="obsidian://open?file=MOC - TypeScript">MOC - TypeScript</a> / <a href="obsidian://open?file=MOC - Vue3">MOC - Vue3</a> / <a href="obsidian://open?file=MOC - Next.js">MOC - Next.js</a> / <a href="obsidian://open?file=MOC - Nuxt.js">MOC - Nuxt.js</a>。共 88 篇笔记（含本文）。

---

## 一、目录结构树

```
03_Knowledge/前端/
├── MOC - 前端.md                          ← 本文件
│
├── HTML5/                                  ← L0 三件套 - HTML5（14篇）
│   ├── HTML5-基础语法与文档结构.md
│   └── ...（含7篇配置指南）

└── CSS3/                                   ← L0 三件套 - CSS3（12篇）
    ├── CSS3-基础语法与选择器.md
    └── ...（含6篇配置指南）

└── JavaScript/                              ← L0 三件套 - JavaScript（16篇）
    ├── JavaScript-基础语法与数据类型.md
    ├── JavaScript-基础语法-环境配置与项目初始化.md
    ├── JavaScript-运算符与控制流.md
    ├── JavaScript-函数与参数.md
    ├── JavaScript-核心内置对象.md
    ├── JavaScript-DOM与BOM操作.md
    ├── JavaScript-事件处理机制.md
    ├── JavaScript-面向对象与ES6+.md
    ├── JavaScript-异步编程与网络请求.md
    └── ...（含8篇配置指南）

└── TypeScript/                               ← L3 工程化 - TypeScript（12篇）
    ├── TypeScript-基础与特殊类型.md
    └── ...（含6篇配置指南）

└── Vue3/                                      ← L1-L2 框架核心（13篇）
    ├── Vue3-响应式引擎与CompositionAPI.md     (L1)
    ├── Vue3-模板语法与指令.md                  (L1)
    ├── Vue3-组件通信与插槽.md                  (L1)
    ├── Vue3-样式与CSS特性.md                   (L1)
    ├── Vue3-内置组件.md                        (L1)
    ├── Vue3-异步组件与自定义指令.md            (L1)
    ├── Vite构建工具原理与优势.md               (L2)
    ├── Pinia状态管理核心设计.md                (L2)
    └── ...（含5篇配置指南）

└── Next.js/                                    ← L4 全栈与 SSR - React 生态（8篇）
    ├── Next.js-框架概述与核心特性.md            (L4)
    ├── Next.js-渲染模式.md                     (L4)
    ├── Next.js-文件路由系统.md                  (L4)
    ├── Next.js-项目创建与核心配置.md            (L4)
    └── ...（含4篇配置指南）

└── Nuxt.js/                                    ← L4 全栈与 SSR - Vue 生态（8篇）
    ├── Nuxt.js-框架概述与SSR原理.md             (L4)
    ├── Nuxt.js-路由系统与布局.md                (L4)
    ├── Nuxt.js-数据获取与状态管理.md            (L4)
    ├── Nuxt.js-中间件插件与部署.md              (L4)
    └── ...（含4篇配置指南）
```

---

## 二、分板块笔记列表

### L0 — HTML5 基础（三件套之一）

| 笔记                                                                                       | 一句话简介                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| <a href="obsidian://open?file=基础语法与文档结构">HTML5-基础语法与文档结构</a>                       | DOCTYPE、字符集、基本语法规则和 HTML5 标准页面骨架模板                      |
| <a href="obsidian://open?file=基础语法-环境配置与项目初始化">HTML5-基础语法-环境配置与项目初始化</a>           | VS Code + Live Server + Emmet 搭建 HTML 开发环境              |
| <a href="obsidian://open?file=语义化结构标签">HTML5-语义化结构标签</a>                           | header/nav/main/article/section/aside/footer 等语义标签的完整指南 |
| <a href="obsidian://open?file=语义化结构标签-环境配置与项目初始化">HTML5-语义化结构标签-环境配置与项目初始化</a>     | W3C 验证器、HTMLHint、axe 无障碍检查工具配置                          |
| <a href="obsidian://open?file=文本排版与链接标签">HTML-文本排版与链接标签</a>                         | 块级元素、行内元素（strong/em/mark/code 等）和 `<a>` 标签全解            |
| <a href="obsidian://open?file=文本排版与链接标签-环境配置与项目初始化">HTML-文本排版与链接标签-环境配置与项目初始化</a>   | 链接安全最佳实践（noopener/noreferrer/nofollow）                  |
| <a href="obsidian://open?file=列表与表格标签">HTML-列表与表格标签</a>                             | ul/ol/dl 三种列表 + table/thead/tbody/tfoot 完整表格体系          |
| <a href="obsidian://open?file=列表与表格标签-环境配置与项目初始化">HTML-列表与表格标签-环境配置与项目初始化</a>       | 表格 CSS 最佳实践（border-collapse、响应式溢出处理）                    |
| <a href="obsidian://open?file=多媒体与嵌入技术">HTML5-多媒体与嵌入技术</a>                         | img/picture/audio/video/canvas/svg/iframe 多媒体标签全覆盖      |
| <a href="obsidian://open?file=多媒体与嵌入技术-环境配置与项目初始化">HTML5-多媒体与嵌入技术-环境配置与项目初始化</a>   | 浏览器媒体格式兼容性矩阵 + 音视频编码选择指南                                |
| <a href="obsidian://open?file=表单元素与输入控件">HTML5-表单元素与输入控件</a>                       | form 容器 + 传统/HTML5 新增 input type + 原生表单验证属性             |
| <a href="obsidian://open?file=表单元素与输入控件-环境配置与项目初始化">HTML5-表单元素与输入控件-环境配置与项目初始化</a> | HTML5 表单验证（required/pattern/minlength）配置与调试             |
| <a href="obsidian://open?file=交互组件与全局属性">HTML5-交互组件与全局属性</a>                       | details/summary 折叠面板 + dialog 原生弹窗 + data-* 等全局属性       |
| <a href="obsidian://open?file=交互组件与全局属性-环境配置与项目初始化">HTML5-交互组件与全局属性-环境配置与项目初始化</a> | dialog 兼容性检测 + contenteditable 富文本基础配置                  |

### L0 — CSS3 基础（三件套之二）

| 笔记                                                                                               | 一句话简介                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| <a href="obsidian://open?file=基础语法与选择器">CSS3-基础语法与选择器</a>                                   | CSS 语法规则、三种引入方式、基础/组合/属性/伪类/伪元素选择器全解                             |
| <a href="obsidian://open?file=基础语法与选择器-环境配置与项目初始化">CSS3-基础语法与选择器-环境配置与项目初始化</a>             | VS Code CSS 扩展 + Stylelint + 选择器调试                               |
| <a href="obsidian://open?file=字体文本与盒模型">CSS3-字体文本与盒模型</a>                                   | font/text 属性、box-sizing: border-box 盒模型、margin 合并                |
| <a href="obsidian://open?file=字体文本与盒模型-环境配置与项目初始化">CSS3-字体文本与盒模型-环境配置与项目初始化</a>             | 现代 CSS Reset 模板 + @font-face 自定义字体 + DevTools 盒模型调试              |
| <a href="obsidian://open?file=背景渐变与边框">CSS3-背景渐变与边框</a>                                     | 多背景、linear/radial-gradient、border-radius、box-shadow、border-image |
| <a href="obsidian://open?file=背景渐变与边框-环境配置与项目初始化">CSS3-背景渐变与边框-环境配置与项目初始化</a>               | 视觉效果配方（卡片阴影/渐变按钮/玻璃态/渐变文字）+ 性能注意事项                               |
| <a href="obsidian://open?file=Flexbox与Grid现代布局">CSS3-Flexbox与Grid现代布局</a>                   | Flex 一维布局 + Grid 二维布局，justify-content、align-items、fr 单位          |
| <a href="obsidian://open?file=Flexbox与Grid布局-环境配置与项目初始化">CSS3-Flexbox与Grid布局-环境配置与项目初始化</a> | DevTools Flex/Grid 调试器 + 圣杯布局/居中/自适应卡片模板                         |
| <a href="obsidian://open?file=变形过渡与动画">CSS3-变形过渡与动画</a>                                     | transform（2D/3D变形）、transition（过渡）、@keyframes animation（关键帧动画）    |
| <a href="obsidian://open?file=变形过渡与动画-环境配置与项目初始化">CSS3-变形过渡与动画-环境配置与项目初始化</a>               | Animations 面板调试 + 60fps 性能规则 + prefers-reduced-motion 无障碍        |
| <a href="obsidian://open?file=响应式设计与变量">CSS3-响应式设计与变量</a>                                   | @media 媒体查询、CSS 变量（--*）、RGBA/HSLA、prefers-color-scheme 深色模式      |
| <a href="obsidian://open?file=响应式设计与变量-环境配置与项目初始化">CSS3-响应式设计与变量-环境配置与项目初始化</a>             | Device Mode 调试 + 主题变量模板 + 移动优先断点策略                               |

### L0 — JavaScript 基础（三件套之三）

| 笔记                                                                                       | 一句话简介                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| <a href="obsidian://open?file=基础语法与数据类型">JavaScript-基础语法与数据类型</a>             | var/let/const 三种声明、8 种数据类型、typeof/instanceof 类型检测                  |
| <a href="obsidian://open?file=基础语法-环境配置与项目初始化">JavaScript-基础语法-环境配置与项目初始化</a> | Node.js 安装 + VS Code + ESLint + 三种运行 JS 方式                         |
| <a href="obsidian://open?file=运算符与控制流">JavaScript-运算符与控制流</a>                 | 算术/比较/逻辑运算符、if/switch/for/while、?? 空值合并、?. 可选链                     |
| <a href="obsidian://open?file=函数与参数">JavaScript-函数与参数</a>                     | 四种定义方式、箭头函数 vs 普通函数、默认参数、Rest Parameters、arguments                 |
| <a href="obsidian://open?file=核心内置对象">JavaScript-核心内置对象</a>                   | String/Array/Object 方法大全、map/filter/reduce、Set 去重                  |
| <a href="obsidian://open?file=DOM与BOM操作">JavaScript-DOM与BOM操作</a>             | querySelector、节点创建、属性操作、Class 操作、定时器、location、history              |
| <a href="obsidian://open?file=事件处理机制">JavaScript-事件处理机制</a>                   | addEventListener、事件冒泡/捕获、事件委托、常见事件类型大全                             |
| <a href="obsidian://open?file=面向对象与ES6+">JavaScript-面向对象与ES6+</a>             | 构造函数+原型链、ES6 class/extends、解构赋值、...展开、模板字符串、Set/Map                |
| <a href="obsidian://open?file=异步编程与网络请求">JavaScript-异步编程与网络请求</a>             | Promise 状态机、async/await 终局方案、Fetch API、Promise.all/race/allSettled |

### L3 — TypeScript 工程化

| 笔记 | 一句话简介 |
|------|-----------|
| <a href="obsidian://open?file=基础与特殊类型">TypeScript-基础与特殊类型</a> | boolean/number/string + any/unknown/void/never 四种特殊类型 |
| <a href="obsidian://open?file=基础语法-环境配置与项目初始化">TypeScript-基础语法-环境配置与项目初始化</a> | tsc 安装、tsconfig.json 配置、VS Code TS 工具链 |
| <a href="obsidian://open?file=接口与函数类型">TypeScript-接口与函数类型</a> | Interface 对象形状、函数参数/返回值标注、可选/默认/剩余参数、函数重载 |
| <a href="obsidian://open?file=类与高级类型">TypeScript-类与高级类型</a> | public/protected/private 修饰符、抽象类、枚举、元组、联合/交叉类型 |
| <a href="obsidian://open?file=泛型">TypeScript-泛型</a> | `<T>` 泛型函数/接口/类、`extends` 泛型约束、`keyof` 类型运算符 |
| <a href="obsidian://open?file=类型断言与类型守卫">TypeScript-类型断言与类型守卫</a> | `as` 断言、typeof/instanceof/in 守卫、`pet is Fish` 自定义类型谓词 |
| <a href="obsidian://open?file=工具类型与装饰器">TypeScript-工具类型与装饰器</a> | Partial/Required/Pick/Omit/Record/ReturnType + @decorator 装饰器 |

### L1 — Vue 3 框架核心

| 笔记 | 一句话简介 |
|------|-----------|
| <a href="obsidian://open?file=响应式引擎与CompositionAPI">Vue3-响应式引擎与CompositionAPI</a> | Proxy 响应式、ref/reactive/computed/watch/watchEffect、生命周期、defineModel/provide/inject |
| <a href="obsidian://open?file=模板语法与指令">Vue3-模板语法与指令</a> | v-bind/:class/:style、v-on/@click 修饰符、v-model 双向绑定、v-if/v-for/v-slot、v-memo/v-once |
| <a href="obsidian://open?file=组件通信与插槽">Vue3-组件通信与插槽</a> | defineProps/defineEmits/defineModel、具名/作用域插槽、provide/inject、useAttrs |
| <a href="obsidian://open?file=样式与CSS特性">Vue3-样式与CSS特性</a> | scoped、:deep()/:global()/:slotted()、CSS Modules、v-bind() in CSS |
| <a href="obsidian://open?file=内置组件">Vue3-内置组件</a> | Transition/TransitionGroup、KeepAlive、Teleport、Suspense、component :is |
| <a href="obsidian://open?file=异步组件与自定义指令">Vue3-异步组件与自定义指令</a> | defineAsyncComponent 代码分割、自定义指令 v-focus、插件 app.use() |
| <a href="obsidian://open?file=模板语法-环境配置与项目初始化">Vue3-模板语法-环境配置与项目初始化</a> | npm create vue@latest、Vue DevTools、Volar 扩展 |

### L2 — 构建与状态管理

| 笔记 | 一句话简介 |
|------|-----------|
| <a href="obsidian://open?file=Vite构建工具原理与优势">Vite构建工具原理与优势</a> | ESM 原生模块、No-Bundle 开发模式、HMR 热更新机制 |
| <a href="obsidian://open?file=Pinia状态管理核心设计">Pinia状态管理核心设计</a> | Vue 3 官方状态管理库的 Store 定义、响应式状态与 Action 设计 |

### L4 — Next.js 全栈与 SSR（React 生态）

| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=框架概述与核心特性">Next.js-框架概述与核心特性</a> | 知识笔记 | 8 大核心特性、为什么替代 CRA、turbopack |
| <a href="obsidian://open?file=渲染模式">Next.js-渲染模式</a> | 知识笔记 | SSR/SSG/ISR/CSR 四种模式对比与选型 |
| <a href="obsidian://open?file=文件路由系统">Next.js-文件路由系统</a> | 知识笔记 | Pages Router、Link、动态路由、_app/_document |
| <a href="obsidian://open?file=项目创建与核心配置">Next.js-项目创建与核心配置</a> | 知识笔记 | create-next-app、next.config.js、工程化配置 |

### L4 — Nuxt.js 全栈与 SSR（Vue 生态）

| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=框架概述与SSR原理">Nuxt.js-框架概述与SSR原理</a> | 知识笔记 | 什么是 Nuxt、SSR vs CSR 原理、三种渲染模式 |
| <a href="obsidian://open?file=路由系统与布局">Nuxt.js-路由系统与布局</a> | 知识笔记 | 文件路由、动态路由、NuxtLink、嵌套路由、布局系统 |
| <a href="obsidian://open?file=数据获取与状态管理">Nuxt.js-数据获取与状态管理</a> | 知识笔记 | asyncData/useAsyncData、Axios 集成、Pinia |
| <a href="obsidian://open?file=中间件插件与部署">Nuxt.js-中间件插件与部署</a> | 知识笔记 | Middleware 路由守卫、插件系统、SSG/SSR 部署 |

---

## 三、推荐学习路径

### 阶段一：HTML5 基础（前端入门，约 2-3 周）
1. <a href="obsidian://open?file=基础语法与文档结构">HTML5-基础语法与文档结构</a> — 理解 DOCTYPE、字符集和页面骨架
2. <a href="obsidian://open?file=语义化结构标签">HTML5-语义化结构标签</a> — 用语义标签替代 div 构建页面结构
3. <a href="obsidian://open?file=文本排版与链接标签">HTML-文本排版与链接标签</a> — 掌握文本内容和超链接
4. <a href="obsidian://open?file=列表与表格标签">HTML-列表与表格标签</a> — 列表和表格的数据展示
5. <a href="obsidian://open?file=多媒体与嵌入技术">HTML5-多媒体与嵌入技术</a> — 图片、音视频、画布
6. <a href="obsidian://open?file=表单元素与输入控件">HTML5-表单元素与输入控件</a> — 用户输入与数据收集
7. <a href="obsidian://open?file=交互组件与全局属性">HTML5-交互组件与全局属性</a> — 折叠面板、弹窗和全局属性

> 每篇知识笔记配套一篇"环境配置与项目初始化"指南，建议同步阅读。

### 阶段二：CSS3 样式与布局（需 HTML5 基础，约 2-3 周）
1. <a href="obsidian://open?file=基础语法与选择器">CSS3-基础语法与选择器</a> — 理解 CSS 语法和选择器体系
2. <a href="obsidian://open?file=字体文本与盒模型">CSS3-字体文本与盒模型</a> — 掌握文字样式和盒模型（border-box）
3. <a href="obsidian://open?file=背景渐变与边框">CSS3-背景渐变与边框</a> — 圆角、阴影、渐变等视觉效果
4. <a href="obsidian://open?file=Flexbox与Grid现代布局">CSS3-Flexbox与Grid现代布局</a> — Flexbox 一维布局 + Grid 二维布局（核心重点）
5. <a href="obsidian://open?file=变形过渡与动画">CSS3-变形过渡与动画</a> — transform + transition + @keyframes 动画体系
6. <a href="obsidian://open?file=响应式设计与变量">CSS3-响应式设计与变量</a> — @media 媒体查询 + CSS 变量 + 深色模式

### 阶段三：JavaScript 编程（需 HTML/CSS 基础，约 3-4 周）
1. <a href="obsidian://open?file=基础语法与数据类型">JavaScript-基础语法与数据类型</a> — 理解变量作用域和 JS 类型系统
2. <a href="obsidian://open?file=运算符与控制流">JavaScript-运算符与控制流</a> — 掌握运算符和流程控制
3. <a href="obsidian://open?file=函数与参数">JavaScript-函数与参数</a> — 函数声明、箭头函数、参数高级特性
4. <a href="obsidian://open?file=核心内置对象">JavaScript-核心内置对象</a> — String/Array/Object 方法（数据操作核心）
5. <a href="obsidian://open?file=DOM与BOM操作">JavaScript-DOM与BOM操作</a> — JS 操作网页和浏览器（前端交互基础）
6. <a href="obsidian://open?file=事件处理机制">JavaScript-事件处理机制</a> — 事件绑定、委托、冒泡/捕获
7. <a href="obsidian://open?file=面向对象与ES6+">JavaScript-面向对象与ES6+</a> — 原型链、class、解构、展开、Set/Map
8. <a href="obsidian://open?file=异步编程与网络请求">JavaScript-异步编程与网络请求</a> — Promise、async/await、Fetch API（重中之重）

### 阶段四：TypeScript（需 JS 基础，约 1-2 周）
1. <a href="obsidian://open?file=基础与特殊类型">TypeScript-基础与特殊类型</a> — 理解 TS 类型系统基础
2. <a href="obsidian://open?file=接口与函数类型">TypeScript-接口与函数类型</a> — 定义对象形状和函数签名
3. <a href="obsidian://open?file=类与高级类型">TypeScript-类与高级类型</a> — 面向对象 + 联合/交叉类型
4. <a href="obsidian://open?file=泛型">TypeScript-泛型</a> — TS 最强大的抽象机制（重点）
5. <a href="obsidian://open?file=类型断言与类型守卫">TypeScript-类型断言与类型守卫</a> — 运行时类型安全
6. <a href="obsidian://open?file=工具类型与装饰器">TypeScript-工具类型与装饰器</a> — 类型元编程

### 阶段五：Vue 3 框架（需 HTML+CSS+JS+TS 基础扎实，约 4-6 周）
1. <a href="obsidian://open?file=响应式引擎与CompositionAPI">Vue3-响应式引擎与CompositionAPI</a> — 理解 Proxy 响应式和 Composition API 思维转换
2. <a href="obsidian://open?file=模板语法与指令">Vue3-模板语法与指令</a> — 掌握所有 v- 指令及其修饰符
3. <a href="obsidian://open?file=组件通信与插槽">Vue3-组件通信与插槽</a> — Props/Emits/Slots/Provide 四种通信模式
4. <a href="obsidian://open?file=样式与CSS特性">Vue3-样式与CSS特性</a> — scoped/:deep()/v-bind() in CSS
5. <a href="obsidian://open?file=内置组件">Vue3-内置组件</a> — Transition/KeepAlive/Teleport/Suspense
6. <a href="obsidian://open?file=异步组件与自定义指令">Vue3-异步组件与自定义指令</a> — 代码分割 + 自定义指令 + 插件
7. <a href="obsidian://open?file=Vite构建工具原理与优势">Vite构建工具原理与优势</a> — 掌握现代前端构建工具
8. <a href="obsidian://open?file=Pinia状态管理核心设计">Pinia状态管理核心设计</a> — 中大型应用的状态管理方案

### 阶段四：工程化与全栈（后续扩展）
- <a href="obsidian://open?file=MOC - Next.js">MOC - Next.js</a> — React 全栈框架（SSR/SSG/ISR）
- <a href="obsidian://open?file=MOC - Nuxt.js">MOC - Nuxt.js</a> — Vue 全栈框架（SSR/SSG/SPA）

---

## 四、跨领域关联表

| 本领域概念            | 跨学科关联                                                            | 关联说明                                      |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| HTML `<a>` 超链接   | <a href="obsidian://open?file=XD-3 计算机网络">XD-3 计算机网络</a>         | URL/URI 规范、HTTP 协议、DNS 解析                 |
| HTML `<form>` 表单 | <a href="obsidian://open?file=XD-3 计算机网络">XD-3 计算机网络</a>         | HTTP POST/GET 请求、编码类型                     |
| HTML5 `<canvas>` | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a>     | JavaScript 引擎 JIT 优化绘图指令 → GPU 图形管线       |
| HTML5 `<dialog>` | <a href="obsidian://open?file=XD-2 操作系统">XD-2 操作系统</a>           | 模态对话框的焦点管理和 z-order 机制                    |
| HTML `data-*` 属性 | <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a>     | 关注点分离：数据与行为分离                             |
| HTML 块级/行内布局     | <a href="obsidian://open?file=XD-1 数字系统与体系结构">XD-1 数字系统与体系结构</a> | 浏览器渲染引擎的盒模型计算和布局算法                        |
| Vue 3 Proxy 响应式  | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a>     | 元编程/反射 → 拦截器/代理设计模式                       |
| Vue 3 Proxy 响应式  | <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a>     | 观察者模式、发布-订阅模式                             |
| Vite ESM 构建      | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a>     | ES Module 静态分析 → Tree Shaking → Rollup 打包 |
| HTML 语义化结构       | <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a>     | 关注点分离：结构(HTML) / 表现(CSS) / 行为(JS)         |
| CSS `box-sizing` | <a href="obsidian://open?file=XD-1 数字系统与体系结构">XD-1 数字系统与体系结构</a> | 浏览器渲染引擎的盒模型计算和布局算法                        |
| CSS 选择器特异性       | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a>     | 权重计算类似于编译器符号表的优先级解析                       |
| CSS Flex/Grid 布局 | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>     | 弹性空间分配(Greedy) + 二维矩阵坐标系统                 |
| CSS transform    | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>     | 4×4 齐次坐标变换矩阵 → XD-1(GPU 矩阵乘法单元)           |
| CSS `@media`     | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a>     | 条件分支逻辑（if-else），浏览器动态选择规则块                |
| CSS 变量级联         | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>     | DOM 树上的变量查找 = 作用域链向上查找算法                  |
| JS 原型链           | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>     | 单链表向上遍历，类似作用域链查找算法                        |
| JS Promise 状态机   | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>     | 有限状态机 FSM（pending → fulfilled/rejected）   |
| JS 事件循环          | <a href="obsidian://open?file=XD-2 操作系统">XD-2 操作系统</a>           | 单线程 I/O 多路复用（epoll/kqueue），微任务 vs 宏任务     |
| JS Fetch API     | <a href="obsidian://open?file=XD-3 计算机网络">XD-3 计算机网络</a>         | HTTP 请求-响应模型、CORS 跨域策略                    |
| JS `?.` 可选链      | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a>     | 短路求值的扩展——nullish 短路而非布尔短路                 |

> 跨学科纵深方向：HTML/CSS/JavaScript → XD-4(编程语言与编译) → XD-3(计算机网络) → XD-2(操作系统) → XD-1(体系结构) → XD-5(数据结构与算法) → XD-6(软件工程与架构)

---

## 五、标签使用统计

| 标签 | 频次 | 使用文件 |
|------|------|---------|
| `前端/HTML` | 14 | 全部 HTML 知识笔记和配置指南 |
| `前端/CSS` | 12 | 全部 CSS3 知识笔记和配置指南 |
| `前端/JavaScript` | 16 | 全部 JavaScript 知识笔记和配置指南 |
| `前端/TypeScript` | 12 | 全部 TypeScript 知识笔记和配置指南 |
| `前端/Vue` | 11 | 全部 Vue 3 知识笔记和配置指南 |
| `前端/Next.js` | 8 | 全部 Next.js 知识笔记和配置指南 |
| `前端/Nuxt.js` | 8 | 全部 Nuxt.js 知识笔记和配置指南 |
| `type/笔记` | 40 | 全部知识笔记 |
| `type/教程` | 40 | 全部配置指南 |
| `status/进行中` | 81 | 全部笔记 + 本 MOC |
| `type/MOC` | 1 | 本文件 |
| `前端` | 1 | 本文件 |

> **建议**：前端知识体系已覆盖 HTML5 → CSS3 → JavaScript → TypeScript → Vue 3 → Next.js 全链路。后续按需补充 React 基础、前端测试（Vitest）、PWA 等进阶主题。

> 📂 所属：[[MOC - 知识库总览]]
