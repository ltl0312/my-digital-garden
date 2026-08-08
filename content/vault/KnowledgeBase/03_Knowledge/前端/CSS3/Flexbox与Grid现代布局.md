---
aliases: [CSS Flexbox, CSS Grid, 弹性布局, 网格布局, 现代 CSS 布局]
tags:
  - status/进行中
  - type/笔记
  - 前端/CSS
created: "2026-06-16 19:11"
updated: "2026-06-16 19:11"
source: "CSS3 全面详尽学习笔记（已归档）"
知识体系: "前端 → L0 三件套"
技术版本: "CSS3"
---

# CSS3 Flexbox 与 Grid 现代布局

## 📍 知识体系定位
- **所属技术栈**：前端 Vue 3
- **所在层级**：L0 三件套 → CSS3 → 现代布局
- **上游依赖**：<a href="obsidian://open?file=字体文本与盒模型">CSS3-字体文本与盒模型</a>（布局基于盒模型）、<a href="obsidian://open?file=基础语法与选择器">CSS3-基础语法与选择器</a>
- **下游延伸**：响应式布局、组件库栅格系统、CSS 容器查询
- **同级技术**：Table 布局（已废弃做布局）、Float 布局（旧方案）、Position 定位（精确控制）

## 概述（Overview）
> Flexbox 是一维布局模型，沿**主轴**排布项目（适合导航栏、卡片列表、居中）；Grid 是二维布局模型，同时控制**行和列**（适合整体页面布局、仪表盘）。两者是 CSS3 布局体系的核心，取代了 float/position/table 的旧布局方案。

## 设计初衷（Motivation）

### 历史演进
- **前身技术**：CSS2 时代，网页布局依赖 `<table>`（表格布局）、`float`（浮动布局）、`position: absolute`（绝对定位）。垂直居中需要各种 hack（如 display: table-cell + vertical-align: middle）。
- **为什么前身被淘汰**：Float 最初设计用于"文字环绕图片"，被滥用作页面布局导致清除浮动（clearfix）成为前端面试必考题。表格布局将内容与表现耦合。垂直居中是 CSS 的"世纪难题"。
- **本技术的核心突破**：Flexbox（2009 RFC）从根本上解决了"沿一个方向排列和分配空间"的问题；Grid（2017 正式规范）实现了真正的二维布局——可以同时定义行和列的轨道。垂直居中只需 `display: flex; align-items: center; justify-content: center;`。
- **为什么是它活下来了**：所有现代浏览器原生支持。Flexbox 对齐模型被用于所有现代 CSS 框架（Bootstrap 4+、Tailwind CSS）。Grid 的 `fr` 单位和命名区域极大简化了复杂布局。

### 设计思想
Flexbox 的对齐术语（main axis / cross axis / justify / align）取代了物理方向术语（left / right / top / bottom），天然支持 RTL（从右到左）语言和 flex-direction 翻转。这是一种"逻辑属性"的设计思想，先于 CSS Logical Properties 规范。

### 跨学科溯源
- Flex 弹性空间分配 → XD-5（数据结构和算法：贪心算法——flex-grow 按比例分配剩余空间）
- Grid 轨道定义 → XD-5（矩阵模型：二维网格的坐标系统与行列索引）

## 实现（Implementation）

### Flexbox（一维布局）

**父元素属性（Flex Container）**：

```css
.container {
    display: flex;                  /* 或 inline-flex，激活 Flexbox */
    flex-direction: row;            /* row|row-reverse|column|column-reverse */
    flex-wrap: wrap;                /* nowrap|wrap|wrap-reverse */
    /* 简写：flex-flow: row wrap; */

    /* 主轴对齐（默认水平方向） */
    justify-content: space-between; /* flex-start|center|flex-end|space-between|space-around|space-evenly */

    /* 交叉轴对齐（默认垂直方向，单行） */
    align-items: center;            /* stretch|flex-start|center|flex-end|baseline */

    /* 交叉轴对齐（多行，需 flex-wrap: wrap） */
    align-content: space-evenly;    /* 值同 justify-content */
    gap: 16px;                      /* 行列间距（推荐替代 margin） */
}
```

**子元素属性（Flex Items）**：

```css
.item {
    flex: 1;                        /* 简写：flex-grow flex-shrink flex-basis */
    /* 等价于：flex-grow: 1; flex-shrink: 1; flex-basis: 0%; */
    flex-grow: 1;                   /* 放大比例，0=不放大 */
    flex-shrink: 0;                 /* 缩小比例，0=不缩小 */
    flex-basis: 200px;              /* 初始主轴尺寸 */
    align-self: flex-end;           /* 单个项目覆盖父元素的 align-items */
    order: -1;                      /* 排列顺序，数字越小越靠前（默认0） */
}
```

### Grid（二维布局）

**父元素属性（Grid Container）**：

```css
.grid {
    display: grid;                              /* 或 inline-grid */
    grid-template-columns: repeat(3, 1fr);      /* 三等分列：1fr 1fr 1fr */
    grid-template-columns: 200px 1fr 200px;     /* 固定-弹性-固定 */
    grid-template-rows: auto 1fr auto;          /* 经典：header-content-footer */
    gap: 20px;                                  /* 行列间距（简写，等同于 grid-gap） */

    /* 单元格内容对齐 */
    justify-items: center;   /* 水平：stretch|start|center|end */
    align-items: center;     /* 垂直 */
    place-items: center;     /* 简写：align-items justify-items */

    /* 整个网格在容器内对齐 */
    justify-content: center;
    align-content: center;

    /* 命名区域布局（最直观的方式） */
    grid-template-areas:
        "header header header"
        "sidebar main   main"
        "footer footer footer";
}
```

**子元素属性（Grid Items）**：

```css
.item {
    /* 通过网格线编号定位 */
    grid-column: 1 / 3;      /* 从第1条线跨到第3条线 = 占2列 */
    grid-row: 2 / 4;         /* 占2行 */
    /* 简写：grid-area: row-start / col-start / row-end / col-end; */

    /* 通过命名区域定位 */
    grid-area: header;       /* 放入 grid-template-areas 中名为 header 的区域 */
}
```

### Flex vs Grid 选择指南

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| 导航栏、工具栏 | Flexbox | 沿一个方向排列元素 |
| 卡片列表（自动换行） | Flexbox + `flex-wrap: wrap` | 弹性换行 |
| 水平/垂直居中 | Flexbox | `align-items: center; justify-content: center;` |
| 整体页面布局 | Grid | 同时控制行和列 |
| 仪表盘、面板 | Grid | 二维区域分配 |
| 不等宽多列布局 | Grid + `fr` 单位 | `grid-template-columns: 2fr 1fr` |

> **💡 补充**：Flexbox 和 Grid 并非互斥。常见模式：Grid 做整体页面骨架（header/sidebar/main/footer），Flexbox 做组件内部排列（导航栏中的菜单项、卡片内的按钮组）。

## 关联上下文（全量覆盖）
- **横向对比**：CSS Position 定位 — position: absolute/fixed/sticky 适用于脱离文档流的场景，Flex/Grid 适用于文档流内布局。（📋 待补充）
- **实际应用**：<a href="obsidian://open?file=响应式引擎与CompositionAPI">Vue3-响应式引擎与CompositionAPI</a> — 组件模板中的 `:style` 动态绑定 Flex/Grid 属性
- **易混淆概念**：`justify-content` vs `align-items` — justify 沿**主轴**对齐（flex-direction: row 时是水平），align 沿**交叉轴**对齐（row 时是垂直）；Grid 中 justify-items 是单元格内水平，align-items 是单元格内垂直

> 📂 所属：[[MOC - CSS3]]
