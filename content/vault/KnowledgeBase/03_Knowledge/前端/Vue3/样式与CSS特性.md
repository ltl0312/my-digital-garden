---
aliases: ["Vue3 CSS", "scoped", ":deep", "CSS Modules", "v-bind in CSS", "样式隔离"]
maturity: GROWING
tags: ["status/进行中", "type/笔记", "前端/Vue"]
created: "2026-06-16 19:41"
updated: "2026-06-16 19:41"
source: "Vue 3 全方位详细学习笔记（已归档）"
知识体系: "前端 → L1 框架核心"
技术版本: "Vue 3.5"
---

# Vue 3 样式与 CSS 特性

## 📍 知识体系定位
- **所属技术栈**：前端 Vue 3
- **所在层级**：L1 框架核心 → 样式系统
- **上游依赖**：<a href="obsidian://open?file=基础语法与选择器">CSS3-基础语法与选择器</a>、<a href="obsidian://open?file=响应式引擎与CompositionAPI">Vue3-响应式引擎与CompositionAPI</a>
- **下游延伸**：UnoCSS/Tailwind CSS 原子化样式、CSS-in-JS 方案
- **同级技术**：React CSS Modules、Angular ViewEncapsulation

## 概述（Overview）
> Vue SFC（单文件组件）提供五种样式方案：① **scoped**（通过 `data-v-xxx` 属性自动隔离）② **`:deep()`**（穿透子组件）③ **`:global()`**（在 scoped 内定义全局样式）④ **CSS Modules**（`<style module>`，类名暴露为 `$style` 对象）⑤ **`v-bind()` in CSS**（CSS 中直接使用 JS 响应式变量，运行时自动更新）。

## 设计初衷（Motivation）

### 设计思想
Scoped 样式通过 PostCSS 在编译时为每个选择器添加唯一属性选择器（如 `.title[data-v-f3f3eg9]`），实现"零运行时开销"的样式隔离。`v-bind()` in CSS 是 Vue 3.3+ 最惊艳的特性之一——它让 CSS 直接绑定 JS 变量，通过 CSS 自定义属性（`--hash`）在运行时更新，无需 JS 操作 DOM class。

### 跨学科溯源
- Scoped 样式编译 → <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a>（PostCSS AST 转换：为每个规则的选择器追加属性选择器）
- `v-bind()` in CSS → <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a>（编译时生成 CSS 自定义属性 + 运行时通过 `setProperty` 更新）

## 实现（Implementation）

### Scoped 样式与深度选择器

```vue
<style scoped>
/* ① scoped：自动添加 data-v-xxx 属性实现样式隔离 */
.title { color: red; }
/* 编译后：.title[data-v-f3f3eg9] { color: red; } */

/* ② :deep()：穿透到子组件内部 */
.parent :deep(.child) { color: blue; }
/* 编译后：.parent[data-v-xxx] .child { color: blue; } */

/* ③ :slotted()：针对插槽内容（父组件传入的） */
:slotted(div) { margin: 10px; }

/* ④ :global()：在 scoped 内定义全局样式 */
:global(.global-class) { font-size: 20px; }
</style>
```

### v-bind() in CSS（核心亮点）

```vue
<script setup>
import { ref } from 'vue'
const themeColor = ref('#3498db')
const fontSize = ref(16)
</script>

<template>
  <p class="dynamic-text">响应式样式的文字</p>
  <button @click="themeColor = themeColor === '#3498db' ? '#e74c3c' : '#3498db'">
    切换主题色
  </button>
</template>

<style scoped>
.dynamic-text {
  /* ★ CSS 中直接使用 JS 变量！变化时 CSS 自动更新 */
  color: v-bind('themeColor');          /* 字符串形式 */
  font-size: v-bind(fontSize + 'px');   /* 表达式形式 */
}
</style>
```

### CSS Modules

```vue
<template>
  <!-- $style 对象包含模块化类名的映射 -->
  <p :class="$style.red">红色文字</p>
  <p :class="[$style.red, $style.bold]">红色加粗</p>
</template>

<style module>
.red { color: red; }
.bold { font-weight: bold; }
/* 编译后类名变为 ._red_1abc2 等唯一名，自动避免冲突 */
</style>
```

### 方案对比

| 方案 | 隔离方式 | 运行时开销 | 适用场景 |
|------|---------|-----------|---------|
| `scoped` | data-v-xxx 属性 | 零（纯编译时） | 大部分组件 |
| CSS Modules | 类名哈希 | 零（纯编译时） | 需要 JS 访问类名 |
| `v-bind()` in CSS | CSS 自定义属性 | 极低（setProperty） | JS 驱动的动态样式 |
| `:global()` | 无隔离 | 零 | 第三方库样式覆盖 |

> **💡 补充**：Scoped 样式的注意点——scoped 会影响子组件的**根节点**（这是有意的设计，方便父组件调整子组件布局）。如果不需要，用 `:deep()` 限制穿透范围。

## 关联上下文（全量覆盖）
- **前置知识**：<a href="obsidian://open?file=基础语法与选择器">CSS3-基础语法与选择器</a> — scoped 基于 CSS 属性选择器，`:deep()` 等价于去除 scoped 限制
- **横向对比**：CSS-in-JS — Emotion/Styled Components 在运行时注入样式，Vue scoped 是纯编译时方案。（📋 待补充）
- **进阶方向**：UnoCSS 原子化 CSS — 按需生成的原子化 CSS 方案，与 Vue 完美集成。（📋 待补充）

> 📂 所属：[[MOC - Vue3]]
