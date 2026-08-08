---
aliases: [JS DOM, JS BOM, DOM 操作, 浏览器对象模型, querySelector, getElementById]
tags:
  - status/进行中
  - type/笔记
  - 前端/JavaScript
created: "2026-06-16 19:19"
updated: "2026-06-16 19:19"
source: "JavaScript 终极详细语法与核心知识笔记（已归档）"
知识体系: "前端 → L0 三件套"
技术版本: "ES6+"
---

# JavaScript DOM 与 BOM 操作

## 📍 知识体系定位
- **所属技术栈**：前端 Vue 3
- **所在层级**：L0 三件套 → JavaScript → DOM/BOM API
- **上游依赖**：<a href="obsidian://open?file=核心内置对象">JavaScript-核心内置对象</a>、<a href="obsidian://open?file=基础语法与文档结构">HTML5-基础语法与文档结构</a>
- **下游延伸**：Vue 3 模板渲染（虚拟 DOM → 真实 DOM）、React JSX
- **同级技术**：jQuery（DOM 操作库，已被原生 API 取代）、CSSOM（CSS 对象模型）

## 概述（Overview）
> **DOM（Document Object Model）** 将 HTML 文档映射为节点树，JavaScript 通过 DOM API 可以查询、创建、修改、删除页面元素和属性。**BOM（Browser Object Model）** 提供浏览器环境相关的 API：窗口控制（window）、定时器（setTimeout/setInterval）、地址栏（location）、历史记录（history）、剪贴板（navigator.clipboard）等。

## 设计初衷（Motivation）

### 设计思想
DOM 将 HTML 文档抽象为对象树——每个标签是一个 Element 节点，每段文字是一个 Text 节点。这种统一的对象模型使 JS 可以用同一套 API 操作完全不同的 HTML 结构。BOM 中的 `window` 既是全局对象又是浏览器窗口——所有全局变量和方法都挂在 window 上。

### 跨学科溯源
- DOM 树遍历 → <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a>（树结构的深度优先遍历 DFS，querySelector 相当于 CSS 选择器引擎对 DOM 树做模式匹配）
- `setTimeout` 不精确 → <a href="obsidian://open?file=XD-2 操作系统">XD-2 操作系统</a>（JS 单线程事件循环：宏任务队列, 最小延迟 4ms, 受页面可见性影响）

## 实现（Implementation）

### DOM 查询元素

```javascript
// ① 传统方法
document.getElementById('app');              // 通过 ID 获取单一元素
document.getElementsByClassName('item');     // 通过类名获取 HTMLCollection（动态集合）
document.getElementsByTagName('div');        // 通过标签名获取

// ② 现代方法（推荐）：使用 CSS 选择器语法
document.querySelector('.class');            // 获取第一个匹配元素
document.querySelector('#app .item');        // 支持任意 CSS 选择器
document.querySelectorAll('.item');          // 获取所有匹配的 NodeList（静态）
```

### DOM 创建、插入、删除

```javascript
// 创建
const div = document.createElement('div');     // 创建元素节点
const text = document.createTextNode('Hello'); // 创建文本节点

// 插入
parent.appendChild(div);                       // 插入到父元素末尾
parent.insertBefore(div, referenceNode);        // 插入到参考节点之前
parent.append(div, text);                       // 现代方法（支持多参数, 文本直接写字符串）

// 替换与删除
oldNode.replaceWith(newNode);                  // 替换
element.remove();                              // 删除自身（现代方法）
```

### 属性操作（Attribute vs Property）

```javascript
const link = document.querySelector('a');

// ★ Attribute 方法（操作 HTML 标签属性，始终返回字符串）
link.getAttribute('href');               // 获取属性值
link.setAttribute('href', '/new-url');   // 设置属性
link.removeAttribute('target');          // 移除属性
link.hasAttribute('download');           // 判断是否有该属性

// ★ data-* 自定义属性（HTML5）
// <div id="card" data-user-id="123" data-role="admin">
const card = document.getElementById('card');
card.dataset.userId;   // "123" — data-user-id → dataset.userId（驼峰转换）
card.dataset.role;     // "admin"

// ★ Property 直接访问（推荐用于标准属性）
link.id = "newId";
link.href = "/page";
element.checked = true;    // 复选框状态（Attribue 方法只能获取初始值）
element.value = "input";   // 输入框当前值
```

### 样式操作

```javascript
const box = document.getElementById('box');

// ① 行内样式（只能读写行内 style 属性）
box.style.backgroundColor = "red";      // CSS 连字符 → JS 驼峰
box.style.fontSize = "20px";            // 必须带单位
box.style.display = "none";
box.style.cssText = "color: blue; margin: 10px;"; // 批量设置（覆盖）

// ② Class 操作（推荐：样式写在 CSS，JS 只切换 class）
box.className = "active";               // 直接设置完整 class 字符串
box.classList.add('active');            // 添加
box.classList.remove('hidden');         // 移除
box.classList.toggle('highlight');       // 切换（有则删，无则加）
box.classList.contains('active');       // 是否包含（true/false）

// ③ 获取最终计算样式（从外部 CSS / <style> 中读取）
const styles = window.getComputedStyle(box);
console.log(styles.marginTop);          // 返回浏览器计算的最终值
```

### 内容操作

```javascript
element.innerHTML = "<strong>文本</strong>"; // 设置 HTML（会解析标签）⚠ XSS 风险
element.textContent = "纯文本";              // 设置纯文本（安全，性能好）
element.innerText = "纯文本";                // 同 textContent，但考虑 CSS 可见性
```

### BOM 核心 API

```javascript
// ① 视口尺寸
window.innerWidth;                       // 浏览器视口宽度（含滚动条）
window.innerHeight;

// ② 定时器
let id = setTimeout(() => {}, 1000);     // 延迟一次（毫秒）
clearTimeout(id);                        // 取消
let iid = setInterval(() => {}, 1000);   // 循环执行
clearInterval(iid);

// ③ Location（地址栏）
location.href = "https://google.com";    // 跳转网页
location.reload();                       // 刷新
location.search;                         // "?id=123" — URL 参数

// ④ History（历史记录）
history.back();                          // 后退
history.forward();                       // 前进
history.go(-2);                          // 后退两页

// ⑤ Navigator（设备/浏览器信息）
navigator.userAgent;                     // 客户端代理字符串
navigator.clipboard.writeText("text");   // 写入系统剪贴板
```

> **💡 补充**：`innerHTML` 存在 XSS 安全风险——如果插入的内容包含用户输入且未转义，攻击者可注入 `<script>` 标签。当内容为用户可控时，使用 `textContent` 或 DOMPurify 库消毒。

## 关联上下文（全量覆盖）
- **横向对比**：jQuery 库 — `$('.item')` vs `document.querySelectorAll('.item')`，现代原生 API 已覆盖 jQuery 90% 的常用功能。（📋 待补充）
- **实际应用**：<a href="obsidian://open?file=响应式引擎与CompositionAPI">Vue3-响应式引擎与CompositionAPI</a> — Vue 通过虚拟 DOM 抽象了原生 DOM 操作，开发者几乎不需要直接操作 DOM
- **易混淆概念**：`innerHTML` vs `textContent` vs `innerText` — innerHTML 解析 HTML（危险但功能强），textContent 返回所有文本（性能好），innerText 考虑 CSS 可见性（会触发回流）

> 📂 所属：[[MOC - JavaScript]]
