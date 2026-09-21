---
aliases: [Thymeleaf 配置, Thymeleaf Spring Boot 集成]
maturity: SEEDLING
tags: [status/进行中, type/教程, 后端/Java, 后端/SpringBoot]
created: "2026-06-16 21:58"
updated: "2026-06-16 21:58"
source: "https://www.thymeleaf.org/doc/tutorials/3.1/usingthymeleaf.html"
知识体系: "Java 后端 → L3 框架层"
技术版本: "Thymeleaf 3.1.x + Spring Boot 3.x"
---

# Thymeleaf — 环境配置与项目初始化

## 前置条件
- Spring Boot 3.x 项目（Java 17+）

## Step 1: 添加依赖

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-thymeleaf</artifactId>
</dependency>
```

## Step 2: 创建模板

`src/main/resources/templates/index.html`：
```html
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<head><title>Home</title></head>
<body>
    <h1 th:text="${message}">Welcome</h1>
</body>
</html>
```

## Step 3: Controller

```java
@Controller
public class HomeController {
    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("message", "Hello Thymeleaf!");
        return "index";  // 自动解析为 templates/index.html
    }
}
```

## Step 4: 核心配置（application.yml）

```yaml
spring:
  thymeleaf:
    prefix: classpath:/templates/
    suffix: .html
    cache: false           # 开发时关闭缓存（改模板立即生效）
    decoupled-logic: false # 开启解耦逻辑
```

## 常见问题

1. **模板修改不生效**：确认 `spring.thymeleaf.cache=false`（生产环境设回 `true`）。
2. **`#{}` 国际化不工作**：需要配置 `MessageSource` bean 和 `messages.properties` 文件。
3. **HTML 标签不闭合报错**：Thymeleaf 默认严格解析 HTML，需要在标签属性间保留空格。使用 LEGACYHTML5 模式（需额外依赖）可放宽。

> 📂 所属：[[MOC - SpringBoot]]
