---
aliases: [HashSet, TreeSet, Comparable, Comparator, 集合排序, 中序遍历]
maturity: GROWING
tags:
  - status/已完成
  - type/笔记
  - Java/集合
created: "2026-06-16 10:00"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java.md"
知识体系: "Java 后端 → L2 核心工具"
技术版本: "Java 17"
---
# Java 集合框架 — Set 与排序

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L2 核心工具
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：并发集合（ConcurrentHashMap）、MyBatis-Plus 批量操作（L3）、Redis 数据结构（L5）
- **同级技术**：IO 流（L2）、多线程（L2）、反射与注解（L2）

## 核心概念
> Set 无序不可重复，HashSet 底层是 HashMap（哈希表），TreeSet 底层是 TreeMap（二叉树），可自动排序但需要指定比较规则。

---

## 一、HashSet

### 核心事实
- `new HashSet()` 底层实际上是 `new HashMap()`
- 元素存储在 HashMap 的 key 中，value 是一个固定的 Object 常量
- 利用 HashMap 的 "key 不可重复" 特性实现去重

### 保证无序不可重复的条件
存入 HashSet 的元素必须**同时重写 `hashCode()` 和 `equals()` 方法**。

> 如果只重写 equals 不重写 hashCode，可能两个"相等"的对象落到不同哈希桶，导致重复元素并存。

---

## 二、TreeSet 与排序

### 核心事实
- TreeSet 实现了 `SortedSet` 接口
- `new TreeSet()` 底层实际上是 `new TreeMap()`
- 放入 TreeSet 的数据**自动按照大小排序**
- 遍历方式：**中序遍历**（左→根→右）

### 关键问题：自定义类放入 TreeSet 能排序吗？
**不能！** 因为没有指定比较规则，TreeSet 不知道如何比较两个自定义对象。

### 三种解决方式

#### 方式一：实现 Comparable 接口（自然排序）
```java
class WuGui implements Comparable<WuGui> {
    int age;

    @Override
    public int compareTo(WuGui o) {
        return this.age - o.age;  // 升序：this - 参数
                                   // 降序：参数 - this
    }
}
// 使用时直接：Set<WuGui> set = new TreeSet<>();
```

#### 方式二：构造时传入 Comparator（比较器）
```java
class MyComparator implements Comparator<WuGui> {
    @Override
    public int compare(WuGui o1, WuGui o2) {
        return o1.age - o2.age;
    }
}
Set<WuGui> set = new TreeSet<>(new MyComparator());
```

#### 方式三：匿名内部类传 Comparator
```java
Set<Customer> set = new TreeSet<>(new Comparator<Customer>() {
    @Override
    public int compare(Customer o1, Customer o2) {
        return o1.getAge() - o2.getAge();
    }
});
```

### Comparable vs Comparator 的选择

| 场景 | 推荐方案 |
|------|----------|
| 比较规则固定不变 | `Comparable`（侵入式，写死在类中） |
| 比较规则多个，频繁切换 | `Comparator`（非侵入式，外部灵活传递） |
| 在不修改原类的情况下增加排序 | `Comparator`（唯一选择） |

---

## 关联上下文
- **匿名内部类**：Comparator 的匿名内部类传参是经典用法，详见 <a href="obsidian://open?file=内部类与匿名内部类">Java-面向对象-内部类与匿名内部类</a>
- **前置知识**：需要掌握 📋 待补充：HashCode与Equals协定 才能正确使用 HashSet 的去重机制
- **横向对比**：与 📋 待补充：Java-集合框架-List与Set选型对比 对比，明确无序不可重复场景下的选型理由
- **实际应用**：用于数据去重、白名单校验、自动排序展示等场景
- **进阶方向**：深入学习 📋 待补充：TreeMap红黑树原理 理解 TreeSet 的自动排序底层实现
- **易混淆概念**：Set 的去重依赖 hashCode/equals 方法，与数据库 DISTINCT 基于行记录完全相等的去重机制不同

> 📂 所属：[[MOC - 异常与集合]]