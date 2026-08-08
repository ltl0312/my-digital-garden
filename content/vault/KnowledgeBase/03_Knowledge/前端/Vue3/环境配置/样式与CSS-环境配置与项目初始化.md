---
aliases: [Vue3 样式配置, scoped 调试, CSS Modules 配置]
tags: [status/进行中, type/教程, 前端/Vue]
created: "2026-06-16 19:41"
updated: "2026-06-16 19:41"
source: "https://cn.vuejs.org/api/sfc-css-features.html"
知识体系: "前端 → L1 框架核心"
技术版本: "Vue 3.5"
---

# Vue 3 样式与 CSS — 环境配置

## 前置条件
- Vue 3 项目（参考 <a href="obsidian://open?file=模板语法-环境配置与项目初始化">Vue3-模板语法-环境配置与项目初始化</a>）

## Step 1: 验证 Scoped 样式

```vue
<style scoped>
.title { color: red; }
</style>
<template><h1 class="title">Scoped Test</h1></template>
```
浏览器 DevTools → Elements → 查看 `<h1>` 标签的 data-v-xxx 属性 → 确认样式隔离生效。

## Step 2: `v-bind()` in CSS 验证

```vue
<script setup>
import { ref } from 'vue'
const color = ref('#3498db')
</script>
<style scoped>
.text { color: v-bind(color); }
</style>
```
改变 `color` 值 → 文字颜色实时更新（DevTools Styles 面板可见 CSS 变量变化）。

## Step 3: CSS Modules 验证

```vue
<template><p :class="$style.red">Red Text</p></template>
<style module>.red { color: red; }</style>
```
Elements 面板查看类名 → 已变为 `_red_1abc2` 哈希格式。

## 常见问题

1. **`:deep()` 不生效**：确认选择器语法正确——`.parent :deep(.child)`（parent 后需要空格）。
2. **CSS Modules `$style` 未定义**：确认 `<style module>`（不是 `scoped`），且不能与 scoped 同时使用。

> 📂 所属：[[MOC - Vue3]]
