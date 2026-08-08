---
aliases: [Java命名规范, 代码格式规约, 阿里Java开发手册命名篇]
tags:
  - status/待处理
  - type/笔记
  - Java/规范
created: "2026-06-16 11:00"
updated: "2026-06-16 15:00"
知识体系: "Java 后端 → L0 语言基础"
技术版本: "Java 17 / 阿里巴巴嵩山版 v1.7.0"
source: "阿里巴巴Java开发手册-嵩山版（已归档）"
---

# Java 命名与代码格式规约（阿里巴巴嵩山版）

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L0 语言基础
- **上游依赖**：📋 待补充：Java语法基础 — 掌握基本变量、类型、控制流程后才能理解命名与格式规约。
- **下游延伸**：📋 待补充：代码整洁之道 — 在命名规范基础上进一步学习代码重构与设计原则。
- **同级技术**：📋 待补充：Google Java Style Guide — 另一种主流的 Java 编码风格规范。

## 核心概念
> 命名是代码可读性的第一道门槛。阿里巴巴手册将命名规范置于首位：类名用 UpperCamelCase、方法/变量用 lowerCamelCase、常量全大写下划线分隔，并给出了反例来警示。

---

## 一、命名风格（强制级别）

### 1. 杜绝中英文混合拼音
- ❌ `DaZhePromotion` / `getPingfenByName` / `String fw` / `int 某变量 = 3`
- ✅ 纯英文命名，不混用拼音

### 2. 杜绝不文明用语
- ❌ `blackList` / `whiteList` / `slave` / `RIBENGUIZI`
- ✅ `blockList` / `allowList` / `replica`

### 3. 类名：UpperCamelCase
- ✅ `ForceCode` / `UserDO` / `HtmlDTO` / `XmlService` / `TcpUdpDeal`
- ❌ `forcecode` / `UserDo` / `HTMLDto` / `XMLService` / `TCPUDPDeal`

### 4. 方法名/参数名/变量名：lowerCamelCase
- ✅ `localValue` / `getHttpMessage()` / `inputUserId`

### 5. 常量名：全大写 + 下划线
- ✅ `MAX_STOCK_COUNT` / `CACHE_EXPIRED_TIME`
- ❌ `MAX_COUNT` / `EXPIRED_TIME`

### 6. 抽象类以 Abstract/Base 开头；异常类以 Exception 结尾；测试类以 Test 结尾

### 7. 数组定义：`[]` 紧贴类型
- ✅ `int[] arrayDemo`
- ❌ `int arrayDemo[]`（main 方法中 `String args[]` 除外）

### 8. POJO 类布尔变量不加 `is` 前缀
- ❌ `Boolean isDeleted` → 生成的 getter 为 `isDeleted()`，部分框架解析时可能丢失 `is`
- ✅ `Boolean deleted` → getter 为 `getDeleted()`

### 9. Service/DAO 层方法命名前缀
| 前缀 | 含义 |
|------|------|
| `get` | 获取单个对象 |
| `list` | 获取多个对象（列表） |
| `count` | 统计数量 |
| `save` / `insert` | 新增 |
| `remove` / `delete` | 删除 |
| `update` | 更新 |

### 10. 各层对象命名后缀
| 后缀 | 全称 | 用途 |
|------|------|------|
| DO | Data Object | DAO 层与数据库表一一对应 |
| DTO | Data Transfer Object | Service / Manager 层向外传输 |
| VO | View Object | Web 层向页面展示 |
| BO | Business Object | Service 层业务逻辑对象 |
| POJO | Plain Ordinary Java Object | 统称 |

---

## 二、代码格式（强制级别）

### 缩进与括号
- 使用 **4 个空格**缩进，禁止 Tab 字符
- `if/for/while/switch/do` 等关键字后**必须加空格**
- 大括号 `{}` 的使用规则：
  - 左大括号不换行，右大括号换行
  - `if/else/for/while/do` 即使只有一行代码，也必须使用大括号

### 单行字符限制
- 单行字符数不超过 **120 个**
- 超出时需要换行，换行规则：
  - 第二行相对第一行缩进 4 个空格（JDK8 起允许 8 个）
  - 运算符与下文一起换行
  - 方法调用的点符号与下文一起换行
  - 多个参数时，在逗号后换行

### 空行与空格
- 不同逻辑、不同语义、不同业务的代码之间**插入一个空行**分隔
- 任何二目/三目运算符左右都需要一个空格
- 注释的双斜线与内容之间有一个空格：`// 注释`

### 文件编码与换行
- IDE 文件编码设为 **UTF-8**
- 换行符使用 **Unix 格式**（`\n`），不要用 Windows 格式（`\r\n`）

### 变量声明
- 一行只声明一个变量：`int one = 1;`（而非 `int a = 1, b = 2;`）

---

## 三、常量定义规约

| 规则 | 说明 |
|------|------|
| 不允许魔数直接出现在代码中 | `-1` / `0` 等常量必须定义命名常量，例外：`-1, 0, 1` 在循环中不强制 |
| long 类型必须大写 `L` | `Long a = 2L`（小写 `l` 容易和数字 `1` 混淆） |
| 不要用一个常量类维护所有常量 | 按功能域分类定义（如 `CacheConsts`、`SystemConfigConsts`） |
| 跨包共享常量放在常量类中 | `private static final` 只在本类使用的常量不共享 |
| 推荐使用 `enum` 替代常量类 | 枚举类型安全、语义更强 |

---

## 关联上下文
- **前置知识**：📋 待补充：Java基本数据类型与变量 — 理解变量声明方式后才能正确应用命名规范。
- **横向对比**：📋 待补充：Google Java Style Guide — 两者核心规范高度一致，阿里手册在命名反例和业务场景上更贴近国内团队实践。
- **实际应用**：📋 待补充：Code Review Checklist — 命名规范是代码评审中最常被检查的条目之一。
- **进阶方向**：📋 待补充：代码整洁之道命名篇 — 从"符合规范"进阶到"命名即注释"的设计理念。
- **易混淆概念**：📋 待补充：POJO中布尔字段命名 — `isDeleted` vs `deleted` 在序列化框架中的行为差异是常见踩坑点。
- **完整手册母体**：本笔记源自 阿里巴巴Java开发手册-嵩山版（已归档），建议对照原文查看所有条款
- **OOP 规约深入研究**：手册中关于 equals、hashCode、toString 的规则是 Java 基础的重中之重，详见 <a href="obsidian://open?file=Object类与String基础">Java-Object类与String基础</a>
> 📂 所属：[[MOC - 开发手册]]