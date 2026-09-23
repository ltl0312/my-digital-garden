---
aliases: [DOM 调试, Chrome DevTools Elements, BOM 调试]
tags: [status/进行中, type/教程, 前端/JavaScript]
created: "2026-06-16 19:19"
updated: "2026-06-16 19:19"
source: "https://developer.chrome.com/docs/devtools/dom/"
知识体系: "前端 → L0 三件套"
技术版本: "ES6+"
---

# JavaScript DOM 与 BOM — 环境配置与项目初始化

## 信息来源
- **Chrome DevTools DOM**：https://developer.chrome.com/docs/devtools/dom/（✅ 可访问）

## 前置条件
- VS Code + Live Server（参考 <a href="obsidian://open?file=基础语法-环境配置与项目初始化">JavaScript-基础语法-环境配置与项目初始化</a>）

## Step 1: DOM 调试工具

- **Elements 面板**：选中元素 → 右键 → Break on → subtree modifications（DOM 被 JS 修改时自动断点）
- **Console 面板**：`$0` 引用当前选中的元素，`$('.item')` 等同于 `document.querySelector('.item')`
- **Properties 标签**（Elements 面板右侧）：展开查看元素的所有 DOM 属性

## Step 2: 最小可运行示例

```html
<!-- test.html -->
<div id="app"></div>
<script>
    const app = document.getElementById('app');
    app.innerHTML = '<h1>Hello DOM!</h1>';
    app.style.color = 'blue';
    console.log(getComputedStyle(app).color); // "rgb(0, 0, 255)"
</script>
```
Live Server 打开 → F12 Console → 看到蓝色文字和颜色日志。

## Step 3: XSS 防护检查

```javascript
// ❌ 危险：用户输入直接插入 innerHTML
element.innerHTML = userInput;  // 可能执行 <script> 标签

// ✅ 安全：用 textContent（自动转义）
element.textContent = userInput;

// ✅ 安全：消毒后使用（需引入 DOMPurify 库）
element.innerHTML = DOMPurify.sanitize(userInput);
```

## 常见问题

1. **`querySelector` 返回 null**：检查选择器拼写、确认 DOM 已加载（将脚本放在 `<body>` 末尾或用 `DOMContentLoaded`）。
2. **`getComputedStyle` 获取不到样式**：确认 CSS 已加载（检查 Network 面板是否 404）。

> 📂 所属：[[MOC - JavaScript]]
