---
aliases: [Java OOP 规约, POJO 规约, Java 格式规约, 阿里巴巴 OOP 规范]
tags: [status/进行中, type/笔记, 后端/Java]
created: "2026-06-16 20:07"
updated: "2026-06-16 20:07"
source: "阿里巴巴Java开发手册-母体笔记（已归档）"
知识体系: "Java 后端 → L0 语言基础"
技术版本: "Java 8+ / 阿里巴巴 Java 开发手册 1.4.0"
---

# 阿里巴巴 Java 开发手册 — OOP 与格式规约

## 📍 知识体系定位
- **所属技术栈**：Java 后端
- **所在层级**：L1 面向对象 / L0 语言基础
- **上游依赖**：<a href="obsidian://open?file=对象与this关键字">Java-面向对象-对象与this关键字</a>、<a href="obsidian://open?file=继承与super关键字">Java-面向对象-继承与super关键字</a>
- **下游延伸**：Spring Boot 项目代码审查、SonarQube 规则配置

## 概述（Overview）
> 阿里巴巴 OOP 规约是 Java 编码规范的核心部分，规定了 POJO 类的设计原则（必须覆写 toString、equals 必须同时覆写 hashCode）、方法设计约束、类命名约定和格式规范。这些规则源于阿里内部数千个项目的实战经验，目标是"避免线上事故"。

## 实现（Implementation）

### OOP 核心规约

| 规则 | 说明 |
|------|------|
| POJO 必须覆写 `toString()` | 便于日志输出和问题排查 |
| `equals()` 必须同时覆写 `hashCode()` | 否则 HashMap/HashSet 行为异常 |
| POJO 禁止写业务逻辑 | POJO 仅做数据载体（贫血模型） |
| DO/DTO/VO 不要设定默认值 | `gmtCreate` 等字段由数据库/框架处理 |
| 禁止 POJO 中 `isXxx()` 与 `getXxx()` 并存 | 框架序列化时可能产生歧义 |
| `@Override` 必须加 | 防止意外重载（`getObject` vs `get0bject`） |

### 方法/类设计约束

```java
// ✅ 正确：方法签名清晰
public void processOrder(OrderDTO order, UserContext context) { }

// ❌ 错误：过长的参数列表（超过 5 个应封装为对象）
public void process(String a, int b, long c, Date d, String e, boolean f) { }

// ✅ 正确：类名使用 UpperCamelCase
public class OrderFactory { }
public class LoginProxy { }
public class ResourceObserver { }

// ❌ 错误
public class orderfactory { }  // 全小写
```

### 格式规约速查

| 规则 | 正确 | 错误 |
|------|------|------|
| 大括号 | `if (x) { }` 左大括号不换行 | `if (x)\n{ }` |
| 空格 | `a = b + c;` 运算符两侧加空格 | `a=b+c;` |
| 缩进 | 4 个空格（禁止 Tab） | Tab + 空格混用 |
| 单行长度 | ≤ 120 字符 | 超长行不换行 |
| import | 不使用通配符 `*` | `import java.util.*;` |

> **💡 补充**：阿里巴巴手册强制要求 POJO 中 boolean 类型的 getter 方法名为 `isXxx()`（而非 `getXxx()`），但包装类 Boolean 仍用 `getXxx()`。这是为了与 JavaBeans 规范一致且避免 RPC 序列化问题。

## 关联上下文（全量覆盖）
- **前置知识**：<a href="obsidian://open?file=对象与this关键字">Java-面向对象-对象与this关键字</a> — 封装是 OOP 规约的底层基础
- **实际应用**：Spring Boot 项目中 Entity/DTO/VO 的分层命名和结构设计

> 📂 所属：[[MOC - 开发手册]]