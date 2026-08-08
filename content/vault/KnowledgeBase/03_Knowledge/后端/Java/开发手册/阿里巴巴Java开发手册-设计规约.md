---
aliases: [Java 设计规约, 阿里巴巴设计规范, 设计模式规范]
tags: [status/进行中, type/笔记, 后端/Java]
created: "2026-06-16 20:17"
updated: "2026-06-16 20:17"
source: "阿里巴巴Java开发手册-母体笔记（已归档）"
知识体系: "Java 后端 → L3 框架层"
技术版本: "Java 8+ / 阿里巴巴 Java 开发手册 1.4.0"
---

# 设计规约

## 📍 知识体系定位
- **所属技术栈**：Java 后端
- **所在层级**：L3 框架层 / L6 微服务
- **上游依赖**：设计模式基础、SOLID 原则
- **下游延伸**：DDD 领域驱动设计、微服务架构

## 实现（Implementation）

### 核心设计规约

| 规则 | 说明 |
|------|------|
| 【强制】设计方案需评审 | 存储方案、底层数据结构、计算逻辑等需有人评审 |
| 【强制】类/方法设计遵循单一职责 | 一个类只做一件事（高内聚）；如果超过 3000 行考虑拆分 |
| 【强制】对外暴露的接口需封装 | Service 层对外暴露接口，实现类不直接暴露 |
| 【推荐】多用组合少用继承 | `extends` 会暴露父类实现细节，违反封装；优先用组合（`has-a`） |
| 【强制】禁止过长的参数列表 | 方法参数超过 5 个封装为对象 |
| 【推荐】避免重复代码（DRY） | 同项目内出现 2 次以上相同逻辑——提取为公共方法 |

### 应用分层规范

```
Controller 层：参数校验、调用 Service、封装返回 VO
    ↓（禁止 Controller 直接调用 DAO）
Service 层：业务逻辑、事务控制（@Transactional）
    ↓
Manager 层（可选）：通用业务处理（组合多个 DAO/第三方服务）
    ↓
DAO 层：单表 CRUD、数据库交互（不添加业务逻辑）
```

### 设计模式应用

```java
// ✅ 策略模式替代 if-else 分支
interface PayStrategy { void pay(BigDecimal amount); }
class AliPay implements PayStrategy { ... }
class WechatPay implements PayStrategy { ... }

// ✅ 模板方法模式定义流程骨架
abstract class OrderProcessor {
    final void process() {     // final 防止子类篡改流程
        validate();
        calculatePrice();
        createOrder();
        afterCreate();         // 钩子方法，子类可扩展
    }
    abstract void afterCreate();
}

// ❌ 反例：超过 3 层的 if-else
if (type == 1) { ... } else if (type == 2) { ... } else if (...) { ... }
```

### 服务器与工程规约补充

| 规则 | 说明 |
|------|------|
| 高并发服务器调小 TCP `time_wait` | 减少端口占用 |
| 生产环境 JVM 参数 | `-Xms` 与 `-Xmx` 设为相同值（避免动态扩容） |
| 二方库版本统一管理 | 使用 `dependencyManagement` 集中声明依赖版本 |
| 线上应用不复用本地开发配置 | 配置与环境分离（Profile / Apollo / Nacos） |

> **💡 补充**：阿里巴巴手册特别强调"单一职责"——如果一个类的注释里出现了 `and`/`or`/`and/or`，说明这个类可能承担了过多职责，考虑拆分。

## 关联上下文（全量覆盖）
- **前置知识**：📋 待补充：设计模式（GOF 23 种）— 手册的设计规约基于经典设计模式总结
- **实际应用**：Spring Boot 项目按 Controller → Service → DAO 分层实现
- **进阶方向**：📋 待补充：DDD 领域驱动设计 — 充血模型替代贫血模型

> 📂 所属：[[MOC - 开发手册]]