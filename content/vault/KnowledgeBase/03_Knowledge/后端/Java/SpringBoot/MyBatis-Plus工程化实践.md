---
aliases: [MyBatis-Plus, BaseMapper, LambdaQueryWrapper, 分页插件, 防全表更新]
tags:
  - status/进行中
  - type/笔记
  - Java/MyBatis
created: "2026-06-16 12:30"
updated: "2026-06-16 15:00"
知识体系: "Java 后端 → L3 框架层"
技术版本: "Spring Boot 3.x / Java 17"
source: "00_Inbox/Java全栈开发实战笔记(SpringBoot+Vue3).md"
---

# MyBatis-Plus 工程化实践

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L3 框架层
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> MyBatis-Plus (MP) 对 MyBatis 做"只增强不做改变"，通过泛型注入自动生成 CRUD SQL，LambdaQueryWrapper 消除字段硬编码，内置拦截器实现物理分页和防全表更新保护。

---

## 一、BaseMapper 与 IService：消灭 90% 的 XML

### 工作原理

```
项目启动
  └── MP 通过反射扫描所有 Mapper 接口
        └── 识别泛型参数中的实体类（如 BaseMapper<User> → User.class）
              └── 读取实体类上的 @TableName 注解获取表名
                    └── 读取 @TableId、@TableField 获取主键和字段映射
                          └── 动态生成 SELECT/INSERT/UPDATE/DELETE SQL
                                └── 注入 MyBatis 的 MappedStatement 注册表
```

### 代码对比

```java
// ===== 传统 MyBatis：需要 XML 映射文件 =====
// UserMapper.java
public interface UserMapper {
    User selectById(Long id);
    int insert(User user);
    List<User> selectAll();
}
// UserMapper.xml ← 必须写 SQL

// ===== MyBatis-Plus：继承 BaseMapper 即可 =====
public interface UserMapper extends BaseMapper<User> {
    // 无需任何方法和 XML！
    // 自动获得：selectById, selectList, insert, updateById, deleteById...
}

// 使用
User user = userMapper.selectById(1L);
List<User> users = userMapper.selectList(null); // null = 查询全部
```

### BaseMapper 核心方法速查

| 方法 | SQL 类型 | 说明 |
|------|----------|------|
| `insert(T entity)` | INSERT | 插入一条记录 |
| `deleteById(Serializable id)` | DELETE | 按主键删除 |
| `updateById(T entity)` | UPDATE | 按主键更新 |
| `selectById(Serializable id)` | SELECT | 按主键查询 |
| `selectList(Wrapper<T> wrapper)` | SELECT | 条件查询（wrapper=null 查全部） |
| `selectPage(IPage<T> page, Wrapper<T> wrapper)` | SELECT | 分页查询 |

---

## 二、LambdaQueryWrapper：强类型消除硬编码（核心价值）

### 问题场景
```java
// ❌ 传统写法：字段名硬编码
query.eq("user_name", "张三");
// 数据库字段改名为 username → 代码全量报错，编译期无法发现！
```

### MP 方案：方法引用
```java
// ✅ Lambda 写法：编译期类型检查
query.eq(User::getUserName, "张三")
     .gt(User::getAge, 18)
     .like(User::getEmail, "@gmail.com")
     .orderByDesc(User::getCreateTime);
```

### 常用条件方法
| 方法 | SQL 等价 | 说明 |
|------|----------|------|
| `eq(R column, Object val)` | `column = val` | 等于 |
| `ne` | `column <> val` | 不等于 |
| `gt / ge` | `> / >=` | 大于/大于等于 |
| `lt / le` | `< / <=` | 小于/小于等于 |
| `like / notLike` | `LIKE / NOT LIKE` | 模糊匹配（自动加 %） |
| `between` | `BETWEEN` | 范围 |
| `in / notIn` | `IN / NOT IN` | 集合包含 |
| `isNull / isNotNull` | `IS NULL / IS NOT NULL` | 空值 |
| `orderByAsc / orderByDesc` | `ORDER BY` | 排序 |

---

## 三、内置拦截器生态

### 分页插件（PaginationInnerInterceptor）
```java
@Configuration
public class MybatisPlusConfig {
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

        // ① 物理分页：自动拦截 SQL 并拼装 LIMIT 子句
        PaginationInnerInterceptor pagination = new PaginationInnerInterceptor(DbType.MYSQL);
        pagination.setMaxLimit(500L);  // 单页最大 500 条，防止恶意拉全表
        interceptor.addInnerInterceptor(pagination);

        // ② 防全表更新删除：不存在 WHERE 条件时直接拦截报错
        interceptor.addInnerInterceptor(new BlockAttackInnerInterceptor());

        return interceptor;
    }
}
```

### 分页使用
```java
// 构建分页对象
Page<User> page = new Page<>(1, 10);  // 第1页，每页10条

// 执行分页查询（MP 自动在 SQL 末尾加 LIMIT 0,10）
IPage<User> result = userMapper.selectPage(page,
    new LambdaQueryWrapper<User>().gt(User::getAge, 18));

// 获取分页数据
List<User> records = result.getRecords();  // 当前页数据
long total = result.getTotal();            // 总记录数
long pages = result.getPages();            // 总页数
```

### BlockAttackInnerInterceptor：防删库跑路
```java
// ❌ 这条 SQL 会被拦截器直接阻止：
userMapper.delete(null);  // DELETE FROM user ← 没有 WHERE 条件！

// ✅ 正确：
userMapper.delete(new LambdaQueryWrapper<User>().eq(User::getId, 1L));
```

---

## 四、MP vs 传统 MyBatis vs JPA 选型对比

| 维度 | 原生 MyBatis | MyBatis-Plus | Spring Data JPA |
|------|-------------|-------------|-----------------|
| SQL 控制力 | ⭐⭐⭐⭐⭐ 完全手动 | ⭐⭐⭐⭐ 自动+手动 | ⭐⭐ 自动生成 |
| 开发效率 | ⭐⭐ 需写 XML | ⭐⭐⭐⭐⭐ 基本零 XML | ⭐⭐⭐⭐ |
| 复杂查询 | 手写 SQL 灵活 | Lambda + 手写 SQL 结合 | JPQL 有局限 |
| 学习成本 | 中 | 低 | 高（方法命名规则） |
| 适合场景 | SQL 密集、复杂报表 | 通用 CRUD 为主 + 少量复杂查询 | 快速原型、简单业务 |

### 跨学科溯源（如适用）
> 沿 03_Knowledge/技术划分.md 跨学科纵深追溯。例如：Java synchronized → XD-2(OS Mutex) → XD-1(CPU 原子指令 CMPXCHG)。

（根据当前技术实际追溯其底层学科依赖，无明确跨学科关联则写"本技术为工程实践，无直接跨学科来源"。）

---

## 关联上下文
- **前置知识**：硬编码 SQL 映射的痛点，详见 📋 待补充：MyBatis基础入门
- **横向对比**：与 Spring Data JPA 的选型取舍，详见 📋 待补充：MyBatis-Plus-vs-JPA对比
- **实际应用**：企业级 CRUD 脚手架中的落地模式，详见 📋 待补充：MP工程化落地案例
- **进阶方向**：MyBatis-Plus 插件开发和自定义拦截器，详见 📋 待补充：MP插件扩展
- **易混淆概念**：MyBatis-Plus 与 MyBatis Generator 的区别，详见 📋 待补充：MP-vs-MBG区别

> 📂 所属：[[MOC - SpringBoot]]
