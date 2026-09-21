---
aliases: [Thymeleaf, 模板引擎, 服务端渲染, HTMX, th:fragment, th:each]
maturity: GROWING
tags: [status/进行中, type/笔记, 后端/Java, 后端/SpringBoot]
created: "2026-06-16 21:58"
updated: "2026-06-16 21:58"
source: "Thymeleaf 核心知识点总结（已归档）"
知识体系: "Java 后端 → L3 框架层"
技术版本: "Thymeleaf 3.1.x + Spring Boot 3.x"
---

# Thymeleaf 3.1 核心语法与模板引擎

## 📍 知识体系定位
- **所属技术栈**：Java 后端
- **所在层级**：L3 框架层 → Spring MVC 视图层
- **上游依赖**：<a href="obsidian://open?file=自动装配原理与MVC生命周期">SpringBoot3-自动装配原理与MVC生命周期</a>（Spring MVC 视图解析）
- **下游延伸**：HTMX 极简 SPA、Alpine.js 轻量交互
- **同级技术**：JSP（已淘汰）、FreeMarker、Vue/React 前后端分离

## 概述（Overview）
> Thymeleaf 是 Spring Boot 官方推荐的服务器端模板引擎。在纯前后端分离主流的今天，它的最佳生存土壤已演变为**高安全性系统渲染**（服务端控制一切）、**SEO 敏感型站点**（首屏直接返回 HTML）以及配合 **HTMX** 构建"极简响应式 SPA"。

## 设计初衷（Motivation）

### 设计思想
Thymeleaf 的核心理念是"**自然模板**"——模板文件本身是合法的 HTML（可以直接在浏览器中打开预览静态效果）。这与 JSP（不能直接在浏览器打开）有本质区别。`th:xxx` 属性在静态预览时被浏览器忽略，在服务端渲染时被 Thymeleaf 引擎替换为动态内容。

## 实现（Implementation）

### 三大表达式

```html
<!-- ① ${...} 变量取值：SpringEL 驱动，支持安全导航 ?. 和默认值 ?: -->
<p th:text="${user?.profile?.nickname ?: '匿名用户'}">占位文字</p>

<!-- ② *{...} 选择表达式：配合 th:object 减少重复 -->
<div th:object="${session.user}">
    <p>姓名: <span th:text="*{name}">未设置</span></p>
    <p>年龄: <span th:text="*{age}">未设置</span></p>
</div>

<!-- ③ @{...} 链接重写：自动补 Context Path、带参路由 -->
<link th:href="@{/css/app.css}" rel="stylesheet" />
<a th:href="@{/order/detail(id=${order.id}, from='list')}">查看详情</a>
<!-- 解析为：/app/order/detail?id=123&from=list -->
```

### 动态类名与样式

```html
<!-- ✅ 推荐 th:classappend：保留静态 class，追加动态 class -->
<button class="btn btn-primary"
        th:classappend="${status == 'ERROR'} ? 'btn-danger' : 'btn-success'">
    提交
</button>
<!-- 渲染结果：class="btn btn-primary btn-danger"（静态+动态共存） -->
```

### 迭代与状态对象

```html
<tr th:each="user, stat : ${users}" th:class="${stat.odd} ? 'bg-light' : 'bg-white'">
    <td th:text="${stat.count}">1</td>           <!-- count: 从1开始 -->
    <td th:text="${user.name}">姓名</td>
    <td th:if="${stat.first}">我是第一行！</td>
</tr>
<!-- stat 属性：index(0开始), count(1开始), size, odd, even, first, last -->
```

### 模板布局继承（Fragment）

**定义骨架（`layout.html`）**：
```html
<html th:fragment="base(title, content)">
<head><title th:replace="${title}">默认标题</title></head>
<body>
    <header>通用导航栏</header>
    <main><div th:insert="${content}"></div></main>
</body>
</html>
```

**调用骨架（`index.html`）**：
```html
<html th:replace="~{layout :: base(~{::title}, ~{::section})}">
<head><title>首页 - 控制台</title></head>
<body>
    <section><h1>欢迎回来</h1><p>业务内容</p></section>
</body>
</html>
```

### Thymeleaf + HTMX：极简 SPA

```html
<!-- 前端：HTMX 属性发起 AJAX，局部替换 DOM -->
<button hx-get="/users" hx-target="#user-table">加载用户列表</button>
<div id="user-table"></div>
```

```java
// 后端：只返回 HTML 片段（th:fragment），不返回完整页面
@GetMapping("/users")
public String getUsers(Model model) {
    model.addAttribute("users", userService.findAll());
    return "users :: userList";  // ★ 返回 users.html 中名为 userList 的 fragment
}
```

> **💡 补充**：Thymeleaf + HTMX 的组合消除了前后端分离中大量 JavaScript 胶水代码（JSON 解析、DOM 更新）。对于管理后台、CMS 系统等交互密集度不高的场景，这是比 React/Vue 更务实的方案。

### 解耦逻辑（Decoupled Logic）

`application.yml`：
```yaml
spring:
  thymeleaf:
    decoupled-logic: true
```

原型文件 `index.html` 保持纯净 HTML → 同级目录 `index.th.xml` 注入动态逻辑 → 引擎运行时"缝合"两者。

## 关联上下文（全量覆盖）
- **前置知识**：<a href="obsidian://open?file=自动装配原理与MVC生命周期">SpringBoot3-自动装配原理与MVC生命周期</a> — Thymeleaf 作为 ViewResolver 被 Spring MVC 调用
- **横向对比**：<a href="obsidian://open?file=模板语法与指令">Vue3-模板语法与指令</a> — Thymeleaf 的 `th:each` 对应 Vue 的 `v-for`，`th:if` 对应 `v-if`
- **实际应用**：Spring Boot 管理后台、邮件模板渲染、CMS 内容管理系统
- **进阶方向**：📋 待补充：HTMX 深入 — HX-Trigger 服务端推送事件、主动轮询

> 📂 所属：[[MOC - SpringBoot]]
