---
aliases: [Java 控制语句规约, Java 注释规约, 阿里巴巴控制语句规范]
tags: [status/进行中, type/笔记, 后端/Java]
created: "2026-06-16 20:17"
updated: "2026-06-16 20:17"
source: "阿里巴巴Java开发手册-母体笔记（已归档）"
知识体系: "Java 后端 → L0 语言基础"
技术版本: "Java 8+ / 阿里巴巴 Java 开发手册 1.4.0"
---

# 控制语句与注释规约

## 📍 知识体系定位
- **所属技术栈**：Java 后端
- **所在层级**：L0 语言基础 → 控制流与文档
- **上游依赖**：<a href="obsidian://open?file=控制语句">Java-控制语句</a>、<a href="obsidian://open?file=运算符">Java-运算符</a>
- **下游延伸**：SonarQube 静态代码检查规则

## 实现（Implementation）

### 控制语句规约

```java
// ✅ 正确：switch 必须有 default
switch (status) {
    case 1: handlePending(); break;
    case 2: handleDone(); break;
    default: throw new IllegalStateException("Unknown: " + status);
}

// ❌ 错误：if 语句使用复杂取反逻辑
if (!(x > 10 && y < 5 || !flag)) { }  // 难以理解
// ✅ 正确：正面表达
if (x <= 10 || y >= 5 && flag) { }

// ✅ 正确：三目运算不嵌套
String result = condition ? "yes" : "no";

// ❌ 错误：嵌套三目（可读性灾难）
String s = a > b ? (c > d ? "x" : "y") : (e > f ? "z" : "w");
```

| 规则 | 说明 |
|------|------|
| switch 必须有 default | 即使不做事也要写 `default: break;` |
| 禁止 if 复杂取反 | 用正面逻辑表达，减少认知负担 |
| 三目运算不嵌套 | 嵌套三目是不可维护代码的典型 |
| 禁止 2 个以上相同类型包装类用 == | `Integer(128) == Integer(128)` 为 false（-128~127 缓存除外） |
| 高并发场景用 `LongAdder` | 替代 `AtomicLong`（减少 CAS 自旋消耗） |

### 注释规约

```java
/**
 * 根据用户ID查询订单列表。
 *
 * <p>该方法会包含已取消的订单，如需排除请使用 {@link #getActiveOrders(Long)}。
 *
 * @param userId 用户ID，不能为 null
 * @param page   分页信息，pageNum 从 1 开始
 * @return 订单列表，不会返回 null（空列表返回空 Page 对象）
 * @throws IllegalArgumentException 当 userId 为 null 时抛出
 */
public Page<Order> getOrdersByUser(Long userId, PageQuery page) {
    // ...
}
```

| 规则 | 说明 |
|------|------|
| 类/方法必须 Javadoc | `/** */` 格式，包含 @param/@return/@throws |
| 单行注释另起一行 | `// 注释` 写在代码上方，行尾注释仅用于极简短说明 |
| 注释与代码同步更新 | 修改代码必须同步更新注释（过期注释比没有注释更危险） |
| 被注释掉的代码必须删除 | 不要留着"备用"——Git 已替你记住了 |
| 枚举必须注释 | 每个枚举值说明含义 |

> **💡 补充**：阿里巴巴手册特别强调——**所有覆写方法必须加 `@Override` 注解**。不加 @Override 时，如果基类方法签名变了，子类的"覆写方法"会悄悄变成重载，不会报编译错误，但运行时行为异常（经典的线上 Bug 来源）。

## 关联上下文（全量覆盖）
- **前置知识**：<a href="obsidian://open?file=控制语句">Java-控制语句</a> — if/switch/for/while 基础语法
- **实际应用**：IDEA 装 Alibaba Java Coding Guidelines 插件实时检查违规项

> 📂 所属：[[MOC - 开发手册]]