---
aliases: [Object类, toString, equals, hashCode, finalize, String类基础]
maturity: GROWING
tags:
  - status/已完成
  - type/笔记
  - Java/基础
created: "2026-06-16 10:00"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java.md"
知识体系: "Java 后端 → L0 语言基础"
技术版本: "Java 17"
---
# Java Object 类与 String 基础

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L0 语言基础
- **上游依赖**：无（本技术为 Java SE 入门级知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> Object 是一切类的根，提供了 toString/equals/hashCode/finalize 等基石方法；String 是不可变类，已重写 toString 和 equals，是日常开发中最常用的类型。

---

## 一、Object 类的核心方法

Java 源码位置：`jdk/lib/src/java.base/java/lang/Object.java`

### toString()
```java
// Object 源码
public String toString() {
    return getClass().getName() + "@" + Integer.toHexString(hashCode());
}
```
- 直接 `sout(对象)` 时，Java 会自动调用该对象的 toString()
- 输出格式：`类名@十六进制哈希值`
- 需要可读输出时，重写 toString()

### equals()
```java
// Object 源码
public boolean equals(Object obj) {
    return (this == obj);  // 默认比较内存地址！
}
```
**核心规则：**
- 基本数据类型比较用 `==`
- 引用数据类型比较用 `equals`（前提是该方法被正确重写）

**标准重写模板：**
```java
public boolean equals(Object obj) {
    if (obj == null) return false;
    if (obj == this) return true;
    if (!(obj instanceof MyTime)) return false;
    MyTime m = (MyTime) obj;
    return this.year == m.year
        && this.month == m.month
        && this.day == m.day;
}
```

### finalize()
```java
// Object 源码
protected void finalize() throws Throwable {}
```
- 由 **GC（垃圾回收器）** 负责调用，程序员**不用手动调用**
- 执行时机：对象即将被 GC 回收时（**垃圾回收时机**）
- 作用：在对象销毁前执行一段代码（资源释放等）
- 建议启动 GC：`System.gc()`

### hashCode()
- 返回对象的哈希码值
- **重要规则**：如果 `equals` 方法被重写，`hashCode` 也必须重写（HashMap/HashSet 依赖此约定）

---

## 二、String 类基础

### 核心特性
- String 已重写 `toString()` 和 `equals()`，可直接用于输出和比较
- **字符串是不可变的**：一旦创建，内容不能改变。每次拼接都会产生新字符串对象

### 字符串常量池
```java
String s1 = "hello";                     // 放在方法区的字符串常量池
String s2 = new String("hello");         // 在堆中创建对象，指向常量池中的 "hello"

// 经典面试题：以下代码创建了几个对象？
String a = new String("aaa");
String b = new String("aaa");
// 答案：3 个对象（1 个常量池对象 + 2 个堆中 String 对象）
```

> **GC 不会释放字符串常量池中的对象！**

---

## 三、native 方法标记
在 JDK 源码中，如果一个方法以 `;` 结尾且修饰符列表有 `native` 关键字，表示其底层调用了 C/C++ 写的 DLL（动态链接库）。

---

## 关联上下文
- **前置知识**：理解 Java 基本类型与引用类型的内存分配差异，详见 📋 待补充：Java基本类型与引用类型
- **横向对比**：String 不可变 vs StringBuilder 可变，性能与线程安全的取舍，详见 📋 待补充：String与StringBuilder对比
- **实际应用**：HashMap 的 key 必须同时重写 hashCode 和 equals，否则存取会出问题，详见 <a href="obsidian://open?file=集合框架-Map详解">Java-集合框架-Map详解</a>
- **易混淆概念**：== 比较内存地址，equals 比较内容，集合中的 contains/remove 都依赖 equals，详见 <a href="obsidian://open?file=集合框架-Collection与List">Java-集合框架-Collection与List</a>

> 📂 所属：[[MOC - Java基础]]