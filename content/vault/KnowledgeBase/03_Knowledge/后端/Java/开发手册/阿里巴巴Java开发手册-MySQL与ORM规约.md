---
aliases: [MySQL建表规约, 索引规约, SQL编写规约, ORM映射规约, 阿里数据库规约]
maturity: GROWING
tags:
  - status/待处理
  - type/笔记
  - MySQL/规范
created: "2026-06-16 11:00"
updated: "2026-06-16 15:00"
source: "阿里巴巴Java开发手册-嵩山版（已归档）"
知识体系: "数据库 → L6 分布式与规范"
技术版本: "MySQL 8.0 / 阿里巴巴嵩山版 v1.7.0"
---

# 阿里巴巴 Java 开发手册 — MySQL 数据库与 ORM 规约

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：数据库
- **所在层级**：数据库 → L6 分布式与规范
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> 数据库是大多数系统的核心瓶颈和事故来源。阿里巴巴手册的 MySQL 规约覆盖了建表、命名、字段类型、索引设计、SQL 编写、ORM 映射六大方面，核心原则是"防患于未然，在数据库层面卡住质量"。

---

## 一、建表规约

### 命名规范
| 规则 | 正确示例 | 错误示例 |
|------|----------|----------|
| 表名/字段名必须小写 + 下划线 | `alipay_task` / `force_project` | `AlipayTask` / `ForceProject` |
| 表名禁止数字开头 | ✅ | ❌ `1st_table` |
| 布尔字段 `is_xxx` (unsigned tinyint, 1/0) | `is_deleted` | - |
| 禁用保留字 | ✅ | ❌ `desc` / `range` / `match` / `delayed` |

### 必备三字段
```sql
-- 每张表必须包含的三个字段
`id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
`create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
`update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
```

### 字段类型选择
| 场景 | 推荐类型 | 说明 |
|------|----------|------|
| 小数/金额 | `decimal` | ❌ 禁止 `float` / `double`（精度丢失） |
| 短字符串 | `char` | 定长字段（如 MD5、UUID）用 char |
| 长字符串 | `varchar` ≤ 5000 | 超过 5000 用 `text`，独立成表 |
| 正整数字段 | `unsigned` + 对应类型 | tinyint unsigned: 0~255, int unsigned: 0~43亿 |

### 字段注释强制
- 每个字段必须加 `COMMENT`
- 表的状态字段需要清晰注释每个枚举值的含义

---

## 二、索引规约

### 命名格式
- **主键**：`pk_字段名`
- **唯一索引**：`uk_字段名`
- **普通索引**：`idx_字段名`

### 索引设计原则

| 原则 | 具体说明 |
|------|----------|
| 唯一性检查 | 业务唯一特性的字段必须建唯一索引（即使组合字段） |
| join 优化 | 禁止超过 3 个表的 join；join 字段类型必须一致 |
| varchar 索引长度 | 建索引时指定长度（字段前 20 字符 90% 区分度即可） |
| 最左前缀 | 联合索引必须遵循 `WHERE` 最常出现列 → 区分度最高列的顺序 |
| order by 优化 | 利用索引最左前缀避免 file_sort |
| 覆盖索引 | 查询列全在索引中时 `explain` 显示 `Using index`（最优） |
| 分页优化 | 深分页（大 offset）用子查询 + id 范围定位代替 |

### 深分页优化代码
```sql
-- ❌ 慢：大 offset
SELECT * FROM table WHERE condition LIMIT 100000, 20;

-- ✅ 快：先定位 id，再关联
SELECT t1.* FROM table AS t1
INNER JOIN (SELECT id FROM table WHERE condition LIMIT 100000, 20) AS t2
ON t1.id = t2.id;
```

### 禁止的情况
- ❌ 在 `WHERE` 子句中对字段进行函数/表达式操作（索引失效）
- ❌ 左模糊或全模糊查询 `%xxx` / `%xxx%`（索引失效）

---

## 三、SQL 编写规约

### COUNT 精确用法
| 用法 | 行为 |
|------|------|
| `COUNT(*)` | 统计所有行（含 NULL）—— SQL92 标准 |
| `COUNT(列名)` | 不统计该列为 NULL 的行 |
| `COUNT(DISTINCT col)` | 不统计 NULL 的列去重数 |

### NULL 处理的坑
```sql
-- NULL 的比较逻辑
NULL <> NULL   → NULL（不是 true！）
NULL = NULL    → NULL（不是 true！）
NULL <> 1      → NULL

-- ✅ 正确判断
WHERE column IS NULL
WHERE column IS NOT NULL
```

### SUM 的 NPE 防护
```sql
-- ❌ SUM(col) 在所有行都是 NULL 时返回 NULL（Java 拆箱 → NPE！）
-- ✅ 正确
SELECT IFNULL(SUM(column), 0) FROM table;
```

### IN 与字符集
- `IN` 操作符的集合元素不超过 **1000 个**
- 数据库字符集统一使用 **utf8mb4**（utf8 是阉割版，无法存 emoji）

### TRUNCATE vs DELETE
- `TRUNCATE TABLE` 比 `DELETE` 快，但不能 WHERE 过滤，且不会触发 trigger
- 数据删除首选逻辑删除（`is_deleted = 1`），而非物理删除

---

## 四、ORM 映射规约

### MyBatis/iBATIS 避坑

| 规则 | 说明 |
|------|------|
| **禁止 `SELECT *`** | 必须列出具体字段（3 点理由：性能、可读性、避免 text 字段拖慢） |
| POJO 布尔字段 | `is_xxx` 的 POJO 属性不加 `is`，`<resultMap>` 中手动映射 |
| `#{}` 与 `${}` | 变量占位用 `#{}`，表名/列名动态时才用 `${}`（防 SQL 注入） |
| 不要用 `resultClass` | 必须用 `<resultMap>`，方便解耦和扩展 |
| `queryForList` 陷阱 | iBATIS 的 `queryForList(statement, start, size)` 实际拉全表在内存中取子集 |

### @Transactional 注意事项
- 事务不要滥用，尤其**禁止在 private/protected 方法上标注**（AOP 不生效）
- 捕获异常后必须回滚事务（不要吞掉异常）

### HashMap vs HashTable 在 resultMap 中
- 不要用 `Hashtable` 做 resultMap（`bigint` → `Long` 会自动转 `BigInteger`，Hashtable 不支持 null 会出问题）

---

## 关联上下文
- **前置知识**：本笔记源自 阿里巴巴Java开发手册-嵩山版（已归档），需先理解 MySQL 基础语法与数据库设计原则
- **横向对比**：MySQL 命名与 Java 命名的对应关系（下划线 → 驼峰）详见 阿里巴巴Java开发手册-命名与格式规约；与其他 ORM 框架选型对比见 📋 待补充：JPA与MyBatis选型对比
- **实际应用**：NPE 防护与集合处理规则与本篇多处关联，详见 [阿里巴巴Java开发手册-集合处理避坑]；数据库连接池线程安全见 [阿里巴巴Java开发手册-并发编程安全规约]
- **进阶方向**：可进一步学习 📋 待补充：分库分表策略、📋 待补充：MySQL性能调优实战
- **易混淆概念**：`COUNT(*)` 与 `COUNT(1)` 与 `COUNT(列名)` 的行为差异，`#{}` 与 `${}` 的注入风险区别，以及 `TRUNCATE` 与 `DELETE` 的语义区别

> 📂 所属：[[MOC - 开发手册]]
