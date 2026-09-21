---
aliases: [MySQL 规约, 数据库命名规范, 索引规约, SQL 编写规范, ORM 映射规约]
maturity: GROWING
tags: [status/进行中, type/笔记, 后端/Java, 数据库/MySQL]
created: "2026-06-16 20:07"
updated: "2026-06-16 20:07"
source: "阿里巴巴Java开发手册-母体笔记（已归档）"
知识体系: "数据库 → L1 SQL 语言"
技术版本: "MySQL 5.7+ / 阿里巴巴 Java 开发手册 1.4.0"
---

# 阿里巴巴 Java 开发手册 — MySQL 数据库规约

## 📍 知识体系定位
- **所属技术栈**：数据库
- **所在层级**：L1 SQL 语言 / L2 数据库设计
- **上游依赖**：数据库基础概念（表、字段、索引、SQL）
- **下游延伸**：MyBatis-Plus 代码生成、分库分表方案

## 概述（Overview）
> 阿里巴巴 MySQL 规约覆盖建表、字段、索引、SQL 编写、ORM 映射五大领域。核心原则：**表名小写+下划线、varchar 长度明确、必须有主键、索引命名统一、禁止 SELECT *、单表超 500 万行分库分表**。

## 实现（Implementation）

### 建表规约

| 规则 | 说明 |
|------|------|
| 表名必须小写+下划线 | `user_info` ✅ / `UserInfo` ❌ |
| 表名不以数字开头 | `3rd_order` ❌ |
| 必须有主键 | 推荐自增 ID 或雪花算法 ID |
| 必须包含三个字段 | `id`(PK)、`gmt_create`(创建时间)、`gmt_modified`(修改时间) |
| varchar 长度不超过 5000 | 超过用 TEXT，并独立成表 |
| 单表行数 > 500 万或容量 > 2GB | 推荐分库分表 |

### 索引规约

```sql
-- 索引命名规范
-- 主键：pk_字段名
-- 唯一索引：uk_字段名
-- 普通索引：idx_字段名

-- ✅ 正确
ALTER TABLE user_info ADD INDEX idx_user_name (user_name);
ALTER TABLE order_info ADD UNIQUE KEY uk_order_no (order_no);

-- ❌ 禁止：模糊查询左模糊
SELECT * FROM user WHERE name LIKE '%张三';  -- 无法使用索引
-- ✅ 正确
SELECT * FROM user WHERE name LIKE '张三%';
```

### SQL 编写规约

| 规则 | 正确 | 错误 |
|------|------|------|
| 禁止 `SELECT *` | `SELECT id, name, age` | `SELECT *` |
| COUNT 用 `COUNT(*)` | `COUNT(*)` | `COUNT(列名)` — 不统计 NULL |
| `ISNULL()` 判断空 | `ISNULL(col)` | `col = NULL` — 永远为 false |
| 分页优化 | 先定位 ID 再分页 | 大偏移量 `OFFSET 100000` |
| 禁止存储过程 | 业务逻辑在应用层 | 复杂存储过程（难以调试/版本控制） |

### ORM 映射规约

```java
// ✅ 正确：数据库字段与 POJO 属性用 resultMap 精确映射
// ❌ 错误：依赖 MyBatis 自动驼峰映射（隐含风险）
// ✅ 正确：查询结果封装为 VO/DTO
// ❌ 错误：直接返回数据表对应的 POJO 给前端（暴露表结构）
```

> **💡 补充**：`COUNT(*)` vs `COUNT(1)` vs `COUNT(col)` — MySQL 中 `COUNT(*)` 和 `COUNT(1)` 性能完全一样（优化器会将 `COUNT(1)` 优化为 `COUNT(*)`）。`COUNT(col)` 不统计该列为 NULL 的行，语义不同。

## 关联上下文（全量覆盖）
- **横向对比**：📋 待补充：MySQL 执行计划 Explain 详解
- **实际应用**：<a href="obsidian://open?file=MyBatis-Plus工程化实践">MyBatis-Plus工程化实践</a> — MyBatis-Plus 的 BaseMapper 自动生成 CRUD SQL
- **进阶方向**：📋 待补充：分库分表方案 — ShardingSphere 实现读写分离

> 📂 所属：[[MOC - 开发手册]]