---
aliases: [SQL语法, DDL, DML, DQL, JOIN, 子查询, 聚合函数, 窗口函数]
maturity: GROWING
tags:
  - status/进行中
  - type/笔记
  - 数据库/SQL
created: "2026-06-16 11:30"
updated: "2026-06-16 15:00"
知识体系: "数据库 → L1 SQL 语言"
技术版本: "MySQL 8.0"
source: "00_Inbox/数据库系统.md"
---
# 数据库系统概论 — SQL 核心语法

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：数据库
- **所在层级**：数据库 → L1 SQL 语言
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> SQL 是集 DDL（定义）、DML（操纵）、DCL（控制）于一体的关系数据库标准语言。高度非过程化——只需指定"做什么"，无需指定"怎么做"。

---

## 一、SQL 执行与编写顺序

### 执行顺序（DBMS 内部处理）
```
FROM → [JOIN] → WHERE → GROUP BY → HAVING → SELECT → ORDER BY
```

### 编写顺序（程序员书写）
```
SELECT → [DISTINCT] → FROM → WHERE → GROUP BY → HAVING → ORDER BY
```

> **关键差异**：WHERE 不能使用聚合函数（执行时还未分组），HAVING 可以（执行在 GROUP BY 之后）。

---

## 二、数据定义（DDL）

```sql
-- 创建数据库
CREATE DATABASE EduDB CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- 创建带约束的表
CREATE TABLE Course (
    Cno CHAR(4) PRIMARY KEY,                                    -- 实体完整性
    Cname CHAR(40) NOT NULL UNIQUE,                             -- 唯一 + 非空
    Ccredit SMALLINT CHECK(Ccredit BETWEEN 1 AND 8),           -- 用户定义完整性
    Tno CHAR(4),
    FOREIGN KEY(Tno) REFERENCES Teacher(Tno)                    -- 参照完整性
        ON DELETE SET NULL                                      -- 删除教师时课程 Tno 置空
        ON UPDATE CASCADE                                       -- 修改教师 Tno 时同步更新
);

-- 修改表结构
ALTER TABLE Student ADD Saddr VARCHAR(100);
ALTER TABLE Student MODIFY Saddr VARCHAR(200);
ALTER TABLE Student DROP COLUMN Saddr;

-- 删除表（先删子表后删主表）
DROP TABLE IF EXISTS SC;
DROP TABLE IF EXISTS Student;
```

---

## 三、数据操纵（DML）

```sql
-- 插入：单行 / 多行 / 子查询结果
INSERT INTO Course VALUES('C001', '数据库', 4, 'T001');
INSERT INTO Course(Cno, Cname, Ccredit) VALUES('C002', '操作系统', 4), ('C003', '计算机网络', 3);
INSERT INTO CompStudent(Sno, Sname) SELECT Sno, Sname FROM Student WHERE Sdept = '软件工程';

-- 更新：单表 / 多表关联
UPDATE Course SET Ccredit = 5 WHERE Cno = 'C001';
UPDATE Student S, Dept D SET S.Sgrade = 4 WHERE S.Sdept = D.Dname AND D.Dname = '计算机' AND S.Sage >= 22;

-- 删除：条件删除 / 全部删除 / 清空表
DELETE FROM SC WHERE Grade IS NULL;
DELETE FROM SC;              -- 可回滚
TRUNCATE TABLE SC;           -- 不可回滚，速度快，不记录日志
```

---

## 四、数据查询（DQL）

### 基础查询模式
```sql
-- 条件查询 + 模糊匹配
SELECT DISTINCT Sname, Sno FROM Student WHERE Sdept = '计算机';
SELECT * FROM Student WHERE Sname LIKE '张%' AND Saddr LIKE '%北京%';

-- 分组 + 聚合 + 排序 + 过滤
SELECT Sdept, COUNT(*) AS 人数
FROM Student
GROUP BY Sdept
HAVING COUNT(*) >= 30
ORDER BY 人数 DESC;
```

### 连接查询全景表

| 连接类型 | 行为 | SQL 关键词 |
|----------|------|------------|
| **内连接** | 只返回匹配行 | `INNER JOIN ... ON` |
| **左外连接** | 保留左表所有行，右表无匹配填 NULL | `LEFT JOIN` |
| **右外连接** | 保留右表所有行，左表无匹配填 NULL | `RIGHT JOIN` |
| **全外连接** | 保留两表所有行 | `FULL OUTER JOIN`（MySQL 用 UNION 模拟） |
| **自然连接** | 自动按所有同名列等值连接，去重连接列 | `NATURAL JOIN` |
| **自身连接** | 表与自身连接（必须用别名） | `FROM A e INNER JOIN A m ON ...` |

### 子查询
```sql
-- 非相关子查询（查询选修了"数据库"的学生）
SELECT Sname FROM Student
WHERE Sno IN (
    SELECT Sno FROM SC WHERE Cno = (
        SELECT Cno FROM Course WHERE Cname = '数据库'
    )
);

-- 相关子查询（查询比本专业平均年龄小的学生）
SELECT S1.Sno, S1.Sname, S1.Sage
FROM Student S1
WHERE S1.Sage < (
    SELECT AVG(S2.Sage) FROM Student S2 WHERE S2.Sdept = S1.Sdept
);
```

### 集合操作
| 操作 | 功能 | 去重 |
|------|------|------|
| `UNION` | 合并结果 | ✅ 去重 |
| `UNION ALL` | 合并结果 | ❌ 保留全部 |
| `INTERSECT` | 取交集 | ✅ |
| `EXCEPT` | 差集（第一个有第二个无） | ✅ |

---

## 五、聚集函数速查

| 函数 | 功能 | 注意 |
|------|------|------|
| `COUNT(*)` | 统计所有行（含 NULL） | SQL92 标准 |
| `COUNT(列)` | 统计非 NULL 值数量 | NULL 不计入 |
| `SUM(列)` | 数值列求和 | 全 NULL 返回 NULL（用 `IFNULL` 防护） |
| `AVG(列)` | 数值列平均值 | 忽略 NULL |
| `MAX(列)` / `MIN(列)` | 最大/最小值 | 可用于数值/日期/字符串 |

> **关键规则**：`WHERE` 后不能使用聚合函数，必须用 `HAVING`；`WHERE` 作用于基本表，`HAVING` 作用于分组后的组。

---

## 六、窗口函数

```sql
-- 语法骨架
窗口函数([参数]) OVER (
    [PARTITION BY 分区表达式, ...]
    [ORDER BY 排序表达式 [ASC|DESC], ...]
    [frame_clause]
)

-- 常见使用
SUM(salary) OVER (PARTITION BY department_id) AS dept_total_salary  -- 分区求和
RANK() OVER (PARTITION BY department_id ORDER BY salary DESC)        -- 分区排名
AVG(sale_amount) OVER (ORDER BY sale_date
    ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS moving_avg          -- 移动平均
```

### 常用窗口函数
| 函数 | 用途 |
|------|------|
| `ROW_NUMBER()` | 生成连续序号（无并列） |
| `RANK()` | 排名（有并列，跳跃） |
| `DENSE_RANK()` | 排名（有并列，不跳跃） |
| `SUM() / AVG() / COUNT()` | 聚合运算 |

---

## 关联上下文
- **前置知识**：关系代数是 SQL 的数学基础，选择/投影/连接对应 σ/π/⋈，详见 [数据库系统概论-关系完整性与关系代数]
- **横向对比**：SQL 与 NoSQL 查询语言的选型差异，详见 📋 待补充：SQL与NoSQL对比
- **易混淆概念**：WHERE 与 HAVING 的过滤时机差异、INNER JOIN 与 OUTER JOIN 的数据保留策略，详见 📋 待补充：SQL易混淆概念

> 📂 所属：[[MOC - 数据库系统概论]]
