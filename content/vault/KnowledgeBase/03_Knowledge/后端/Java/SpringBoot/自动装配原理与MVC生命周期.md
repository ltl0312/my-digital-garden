---
aliases: [SpringBoot自动装配, "@SpringBootApplication", DispatcherServlet, Spring MVC请求流程]
maturity: GROWING
tags:
  - status/进行中
  - type/笔记
  - Java/SpringBoot
created: "2026-06-16 12:30"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java全栈开发实战笔记(SpringBoot+Vue3).md"
知识体系: "Java 后端 → L3 框架层"
技术版本: "Spring Boot 3.x / Java 17"
---

# Spring Boot 3 自动装配原理与 MVC 请求生命周期

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L3 框架层
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> Spring Boot 本质是 Spring 框架的"脚手架"，核心理念是"约定大于配置"。`@SpringBootApplication` 触发自动装配机制，在启动时动态加载匹配的配置类；DispatcherServlet 是所有 HTTP 请求的中央调度器，通过一套固定的流水线完成从 URL 到 Controller 方法的映射。

---

## 一、自动装配原理：@SpringBootApplication 的魔法

### 为什么引入 spring-boot-starter-web 后 Tomcat 就自动启动了？

**逐层解剖：**

```
@SpringBootApplication
  └── @EnableAutoConfiguration               ← 核心：开启自动装配
        └── @Import(AutoConfigurationImportSelector.class)
              └── 扫描所有 META-INF/spring/
                    org.springframework.boot.autoconfigure.
                    AutoConfiguration.imports 文件
                    └── 发现 WebMvcAutoConfiguration、DataSourceAutoConfiguration 等
                          └── 每个配置类上有 @ConditionalOnClass 等条件注解
                                └── 检测到 classpath 中有 Tomcat 的 jar → 自动创建 Tomcat 实例
                                └── 检测到 classpath 中有 DataSource → 自动配置数据源
```

### 自动装配的 4 步流程

| 步骤 | 行为 | 关键类/文件 |
|------|------|------------|
| 1. 触发 | `@SpringBootApplication` → `@EnableAutoConfiguration` | 入口注解 |
| 2. 扫描 | 读取所有 starter 包中的 `AutoConfiguration.imports` | 类路径扫描 |
| 3. 条件判断 | 通过 `@ConditionalOnClass`、`@ConditionalOnMissingBean` 等判断是否装配 | 条件注解体系 |
| 4. 注入 | 满足条件则将 Bean 实例化并注入 Spring 容器 | IoC 容器 |

### 条件注解速查表

| 注解 | 判断逻辑 | 示例 |
|------|----------|------|
| `@ConditionalOnClass` | classpath 中存在指定类时才装配 | 存在 `Tomcat.class` → 创建嵌入式 Tomcat |
| `@ConditionalOnMissingBean` | 容器中没有指定 Bean 时才装配 | 用户未自定义 `DataSource` → 使用默认 HikariCP |
| `@ConditionalOnProperty` | 配置文件中存在指定属性时才装配 | `spring.cache.type=redis` → 启用 Redis 缓存 |
| `@ConditionalOnBean` | 容器中存在指定 Bean 时才装配 | 存在 `DataSource` → 自动配置 `JdbcTemplate` |
| `@ConditionalOnWebApplication` | 当前是 Web 应用时才装配 | 非 Web 应用不加载 `DispatcherServlet` |

> **核心记忆口诀**：Spring Boot 启动时做了三件事——"找配置（scan imports）、判条件（conditional）、注 Bean（register）"。

---

## 二、Spring MVC 核心请求生命周期（10 步流水线）

```
每一个 HTTP 请求到达后端，经过了如下完整的流水线：
```

```
浏览器发起请求 → http://localhost:8080/api/users/1
                              │
                    ┌─────────▼──────────┐
                    │ ① Tomcat 线程池    │  内置 Tomcat 分配 Worker 线程
                    │   分配处理线程      │  (默认 200 线程)
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ ② DispatcherServlet│  前端控制器——Spring MVC 的核心调度器
                    │   接收所有请求      │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ ③ HandlerMapping   │  根据 @RequestMapping("/api/users/{id}")
                    │   查找处理器        │  找到对应的 Controller 方法
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ ④ 拦截器链         │  preHandle() → 执行 JWT 校验、权限检查
                    │   Interceptor      │  任何一个返回 false → 请求终止
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ ⑤ HandlerAdapter   │  将请求适配给具体的 Controller 方法
                    │   处理器适配器      │
                    └─────────┬──────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
  ┌──────▼──────┐   ┌────────▼────────┐   ┌───────▼───────┐
  │⑥ HttpMessage│   │⑦ @Validated    │   │⑧ Controller  │
  │  Converter  │──▶│   参数校验      │──▶│   方法执行    │
  │JSON→Java对象│   │JSR303 Bean校验  │   │ 调用Service层 │
  └─────────────┘   └─────────────────┘   └───────┬───────┘
                                                   │
                              ┌────────────────────▼────────────────────┐
                              │ ⑨ 返回结果处理                           │
                              │  Controller 返回 Result 对象             │
                              │  → HttpMessageConverter 序列化为 JSON   │
                              │  → 经过拦截器链的 postHandle()          │
                              └────────────────────┬────────────────────┘
                                                   │
                              ┌────────────────────▼────────────────────┐
                              │ ⑩ Tomcat 响应                           │
                              │  通过 HTTP Response 返回 JSON 给客户端   │
                              │  → 拦截器 afterCompletion() 收尾        │
                              └─────────────────────────────────────────┘
```

### 排查 404 / 400 错误的快速定位

| 错误 | 流水线卡在哪个环节 | 排查方向 |
|------|-------------------|----------|
| **404** | ③ HandlerMapping | URL 路径与 `@RequestMapping` 不匹配；Controller 未被 Spring 扫描到 |
| **400** | ⑥ HttpMessageConverter | JSON 格式错误；字段类型不匹配（如 String 传给 Integer） |
| **403** | ④ Interceptor | JWT Token 无效或过期；权限标识不匹配 |
| **415** | ⑥ HttpMessageConverter | Content-Type 不匹配（如前端发 form-data 但后端只支持 JSON） |

---

## 三、关键对比：Spring Boot 2 vs Spring Boot 3

| 维度 | Spring Boot 2.x | Spring Boot 3.x |
|------|----------------|-----------------|
| JDK 要求 | JDK 8~17 | **JDK 17+**（强制） |
| Jakarta EE | javax.* 命名空间 | **jakarta.*** 命名空间 |
| 自动装配文件 | `spring.factories` | `AutoConfiguration.imports` |
| 默认 GC | Parallel GC | **G1 GC** |
| 可观测性 | 需手动集成 | 内置 Micrometer + Observation API |
| 原生镜像 | 不支持 | 支持 GraalVM Native Image |

---

## Jakarta EE 10 迁移要点（补充自 Spring Boot 3.x 官方文档）

> *以下内容来自 Spring Boot 3.x 官方参考文档全景深度总结（已归档）。*

**核心变更**：`javax.*` → `jakarta.*` 全量替换。

| 组件 | 旧包（Spring Boot 2.x） | 新包（Spring Boot 3.x） |
|------|------------------------|------------------------|
| Servlet | `javax.servlet.*` | `jakarta.servlet.*` |
| JPA | `javax.persistence.*` | `jakarta.persistence.*` |
| Validation | `javax.validation.*` | `jakarta.validation.*` |
| Transaction | `javax.transaction.*` | `jakarta.transaction.*` |

**自动装配 SPI 变更**：

```
Spring Boot 2.x：
  META-INF/spring.factories
  → org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
    com.example.MyAutoConfiguration

Spring Boot 3.x（新方式）：
  META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
  → com.example.MyAutoConfiguration

新注解：@AutoConfiguration 替代 @Configuration
  → 支持 after/before 属性精确控制加载顺序
```

---

## 关联上下文
- **Java 17 新特性**：Records 简化 DTO、Sealed Classes 强化 DDD，是 Spring Boot 3 强制升级 JDK 17 的原因之一
- **全局异常处理**：流水线的异常会进入 `@RestControllerAdvice` 统一兜底，与 `/inbox` 处理逻辑同属横切关注点设计
- **前置知识**：Spring IoC 容器与 DI 依赖注入是理解自动装配的基础，详见 📋 待补充：Spring IoC 与 DI 核心机制
- **横向对比**：Spring Boot 的自动装配与 Spring Framework 的 XML/Java Config 配置方式相比，大幅降低了显式配置量，见 📋 待补充：Spring 配置方式演进
- **实际应用**：微服务架构中，Spring Boot 自动装配 + 起步依赖常用于快速搭建 RESTful 服务与数据库访问层，参见 📋 待补充：微服务模块搭建模板
- **进阶方向**：深入理解 Spring Boot 内部运行机制可学习 Spring Cloud 微服务治理或 Spring Native 原生编译，见 📋 待补充：Spring Cloud 入门 和 📋 待补充：Spring Native 与 GraalVM
- **易混淆概念**：`@EnableAutoConfiguration` 与 `@SpringBootApplication` 的关系：后者是前者的组合注解，包含 `@AutoConfigurationPackage` 和 `@ComponentScan`，详见 📋 待补充：@SpringBootApplication 组合注解剖析

> 📂 所属：[[MOC - SpringBoot]]
