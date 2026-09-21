---
aliases: [SpringBoot 配置, Java Records, ConfigurationProperties, Profile Groups, 多环境配置]
maturity: GROWING
tags: [status/进行中, type/笔记, 后端/Java, 后端/SpringBoot]
created: "2026-06-16 21:56"
updated: "2026-06-16 21:56"
source: "Spring Boot 3.x 官方参考文档全景深度总结（已归档）"
知识体系: "Java 后端 → L3 框架层"
技术版本: "Spring Boot 3.x + Java 17+"
---

# Spring Boot 3 外部化配置与 Record 绑定

## 📍 知识体系定位
- **所属技术栈**：Java 后端
- **所在层级**：L3 框架层 → Spring Boot 配置
- **上游依赖**：<a href="obsidian://open?file=自动装配原理与MVC生命周期">SpringBoot3-自动装配原理与MVC生命周期</a>
- **下游延伸**：Spring Cloud Config、Apollo/Nacos 配置中心

## 概述（Overview）
> Spring Boot 3.x 支持用 **Java Record** 替代传统的 `@Data` POJO 类做配置绑定——Record 天生不可变（immutable），适合配置对象。**Profile Groups** 允许一次激活一组 Profile（如 `production` 组同时激活 `proddb` + `prodmq` + `tracing`），无需在每个配置文件中重复 `spring.profiles.include`。

## 设计初衷（Motivation）

### 设计思想
Java Record（JDK 16+）是"不可变数据载体"的标准实现——所有字段 `private final`，自动生成构造器、getter、equals/hashCode、toString。配置对象"创建后不应修改"的语义与 Record 完美匹配。Spring Boot 3.x 还支持 `@DefaultValue` 注解直接在 Record 组件上声明默认值（替代 Lombok 的 `@Builder.Default`）。

### Profile Groups 解决的问题

```
旧方式（Spring Boot 2.x）：
  application.yml → spring.profiles.include: proddb, prodmq, tracing
  问题：include 写在每个文件里，修改时要改多处

新方式（Spring Boot 3.x）：
  application.yml → spring.profiles.group.production: "proddb, prodmq, tracing"
  优势：集中定义，启动时 --spring.profiles.active=production 一键激活
```

## 实现（Implementation）

### Java Record 配置绑定

```java
@ConfigurationProperties(prefix = "app.storage")
public record StorageProperties(
    String location,
    @DefaultValue("1000") int maxFiles,  // Spring Boot 3.x 内置 @DefaultValue
    Server server
) {
    public record Server(String host, int port) {}
}
// application.yml:
// app:
//   storage:
//     location: /data/files
//     max-files: 5000
//     server:
//       host: localhost
//       port: 9000
```

### Profile Groups

```yaml
spring:
  profiles:
    group:
      production: "proddb, prodmq, tracing"
      development: "devdb, localmq"
# 启动：java -jar app.jar --spring.profiles.active=production
# 等效于同时激活 proddb + prodmq + tracing
```

> **💡 补充**：Record 配置绑定的限制——Record 是不可变的，所以 `setXxx()` 方法不存在。如果你需要运行时修改配置（如通过 JMX 动态调整），应使用传统的 `@ConfigurationProperties` + 可变类。如果配置只在启动时读取一次（99% 的场景），Record 是最佳选择。

## 关联上下文（全量覆盖）
- **前置知识**：<a href="obsidian://open?file=自动装配原理与MVC生命周期">SpringBoot3-自动装配原理与MVC生命周期</a> — `@EnableConfigurationProperties` 将配置类注册到 Spring 容器
- **横向对比**：<a href="obsidian://open?file=阿里巴巴Java开发手册-OOP与格式规约">阿里巴巴Java开发手册-OOP与格式规约</a> — POJO 规范 vs Record 不可变规范
- **实际应用**：Spring Cloud 项目中用 Profile Groups 统一管理 dev/test/prod 环境

> 📂 所属：[[MOC - SpringBoot]]
