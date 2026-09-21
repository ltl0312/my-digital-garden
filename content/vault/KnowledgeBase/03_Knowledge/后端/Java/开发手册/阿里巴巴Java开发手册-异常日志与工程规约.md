---
aliases: [Java 异常处理规约, 日志规约, 单元测试规约, 安全规约]
maturity: GROWING
tags: [status/进行中, type/笔记, 后端/Java]
created: "2026-06-16 20:07"
updated: "2026-06-16 20:07"
source: "阿里巴巴Java开发手册-母体笔记（已归档）"
知识体系: "Java 后端 → L2 核心工具"
技术版本: "Java 8+ / 阿里巴巴 Java 开发手册 1.4.0"
---

# 阿里巴巴 Java 开发手册 — 异常、日志与工程规约

## 📍 知识体系定位
- **所属技术栈**：Java 后端
- **所在层级**：L2 核心工具 / L3 框架层
- **上游依赖**：<a href="obsidian://open?file=异常处理">Java-异常处理</a>、SLF4J/Logback 日志框架
- **下游延伸**：Spring Boot 全局异常处理、APM 监控（SkyWalking/Prometheus）

## 概述（Overview）
> 阿里巴巴手册的异常日志规约规定了 Java 项目中如何处理异常（禁止吞掉异常、异常不用于流程控制）、如何记录日志（用 SLF4J 门面 + 占位符而非字符串拼接）、工程结构的模块划分、以及安全规约（防 XSS/SQL 注入）。

## 实现（Implementation）

### 异常处理规约

```java
// ✅ 正确
try {
    doSomething();
} catch (IOException e) {
    log.error("操作失败, userId={}", userId, e);  // 记录完整堆栈
    throw new BusinessException("操作失败", e);    // 包装后重新抛出
}

// ❌ 错误：吞掉异常
try { doSomething(); } catch (Exception e) { }
// ❌ 错误：异常用于流程控制
try { return obj.getField(); } catch (NullPointerException e) { return null; }
```

| 规则 | 说明 |
|------|------|
| 禁止吞掉异常 | 至少记录日志 |
| 异常不用于流程控制 | 异常开销大（填充栈帧） |
| finally 必须关闭资源 | 或使用 try-with-resources（Java 7+） |
| 区分检查异常和非检查异常 | RuntimeException 的子类不需要声明 throws |

### 日志规约

```java
// ✅ 正确：使用 SLF4J 门面 + 占位符
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
private static final Logger log = LoggerFactory.getLogger(Xxx.class);
log.info("订单创建成功, orderId={}, amount={}", orderId, amount);

// ❌ 错误：直接使用 Log4j/Logback 的实现类
// ❌ 错误：字符串拼接（即使不输出也执行拼接）
log.info("订单创建成功, orderId=" + orderId + ", amount=" + amount);
// ❌ 错误：生产环境输出 DEBUG 日志
```

### 安全规约速查

| 威胁 | 解决方案 |
|------|---------|
| SQL 注入 | MyBatis `#{}` 预编译（禁止 `${}` 拼接用户输入） |
| XSS 跨站脚本 | 输出编码、CSP 头 |
| CSRF | Token 校验、SameSite Cookie |
| 敏感信息泄漏 | 日志中禁止打印密码/身份证/手机号（脱敏处理） |

### 工程结构规约

```
com.company.project
├── controller/    ← 接口层（接收请求、参数校验、调用 Service）
├── service/       ← 业务逻辑层（事务边界）
├── dao/mapper/    ← 数据访问层（单表 CRUD）
├── model/
│   ├── entity/    ← 数据库映射实体（PO）
│   ├── dto/       ← 数据传输对象
│   └── vo/        ← 视图对象（返回前端）
├── config/        ← 配置类
└── util/          ← 工具类
```

> **💡 补充**：日志级别使用指南——ERROR（影响正常流程的异常）、WARN（可恢复的异常/配置缺失回退）、INFO（关键业务流程节点）、DEBUG（调试信息）。生产环境默认 INFO 级别。

## 关联上下文（全量覆盖）
- **前置知识**：<a href="obsidian://open?file=异常处理">Java-异常处理</a> — 异常处理是规约的底层基础
- **实际应用**：Spring Boot `@ControllerAdvice` + `@ExceptionHandler` 实现全局异常处理
- **进阶方向**：📋 待补充：Spring Boot Actuator + Micrometer 生产监控

> 📂 所属：[[MOC - 开发手册]]