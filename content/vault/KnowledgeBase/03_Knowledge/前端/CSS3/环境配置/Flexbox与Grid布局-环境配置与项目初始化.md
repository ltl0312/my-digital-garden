---
aliases: [CSS 布局开发环境, Flexbox 调试, Grid 调试]
maturity: SEEDLING
tags:
  - status/进行中
  - type/教程
  - 前端/CSS
created: "2026-06-16 19:11"
updated: "2026-06-16 19:11"
source: "https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_Flexible_Box_Layout"
知识体系: "前端 → L0 三件套"
技术版本: "CSS3"
---

# CSS3 Flexbox 与 Grid 布局 — 环境配置与项目初始化

## 信息来源
- **Flexbox 文档**：https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_Flexible_Box_Layout（✅ 可访问）
- **Grid 文档**：https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_Grid_Layout（✅ 可访问）
- **Flexbox Froggy**：https://flexboxfroggy.com/（✅ 可访问，游戏化学习 Flexbox）
- **Grid Garden**：https://cssgridgarden.com/（✅ 可访问，游戏化学习 Grid）

## 前置条件
- VS Code + Live Server（参考 <a href="obsidian://open?file=基础语法与选择器-环境配置与项目初始化">CSS3-基础语法与选择器-环境配置与项目初始化</a>）

## Step 1: Chrome DevTools 布局调试

**Flexbox 调试器**：
1. `F12` → Elements → 选中 `display: flex` 的元素
2. Styles 面板中点击 `display: flex` 旁的图标（或查看 Computed 面板）
3. DevTools 会在页面上绘制 Flex 容器的辅助线和每个项目的尺寸
4. 可以实时切换 `flex-direction`、`justify-content` 等属性预览效果

**Grid 调试器**：
1. 选中 `display: grid` 的元素
2. Layout 面板（F12 右侧 → Layout 标签）显示 Grid 叠加层
3. 勾选 "Show grid overlay" → 页面显示网格线、轨道尺寸、区域名称

## Step 2: 验证（Flex + Grid 快速测试）

```html
<style>
    .flex-row { display: flex; gap: 10px; }
    .flex-row > div { flex: 1; background: #eee; padding: 1rem; }
    .grid-3col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .grid-3col > div { background: #eee; padding: 1rem; }
</style>
<div class="flex-row">
    <div>Flex 1</div><div>Flex 2</div><div>Flex 3</div>
</div>
<div class="grid-3col" style="margin-top:20px">
    <div>Grid 1</div><div>Grid 2</div><div>Grid 3</div>
</div>
```
DevTools → Layout 面板 → 勾选 Grid overlay → 确认网格线显示。

## Step 3: 常用布局模板

```css
/* ① 圣杯布局（Header-Sidebar-Main-Footer） */
.holy-grail {
    display: grid;
    grid-template-columns: 250px 1fr;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
        "header header"
        "sidebar main"
        "footer footer";
    min-height: 100vh;
}

/* ② 居中万能写法 */
.center {
    display: flex;  /* 或 grid */
    align-items: center;
    justify-content: center;
}

/* ③ 自适应卡片列表 */
.card-list {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
}
.card-list > * {
    flex: 1 1 300px;  /* grow shrink basis：最小300px，空间足够时均分 */
}
```

## 常见问题

1. **`flex: 1` 子元素溢出**：未设置 `min-width: 0`（Flex 子元素默认 `min-width: auto`），内容撑开。加 `min-width: 0` 解决。
2. **Grid `fr` 单位与固定宽度冲突**：`grid-template-columns: 200px 1fr` 中第一列固定 200px，第二列占剩余空间。如果内容超出 200px，没有 `min-width: 0` 也会溢出。
3. **`gap` 在旧浏览器不兼容**：IE11 不支持 gap。如需要兼容，用 `margin` 替代（但增加了外边距合并的复杂度）。

> 📂 所属：[[MOC - CSS3]]
