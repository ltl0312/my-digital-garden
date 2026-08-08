---
aliases: [Java对象与引用, this关键字, this用法, 空指针异常]
tags:
  - status/已完成
  - type/笔记
  - Java/OOP
created: "2026-06-16 10:00"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java.md"
知识体系: "Java 后端 → L1 面向对象"
技术版本: "Java 17"
---
# Java 面向对象 — 对象与 this 关键字

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L1 面向对象
- **上游依赖**：Java SE 语法基础（L0）：数据类型、运算符、控制流、方法、数组
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> 对象存储在堆内存中，引用变量指向对象的地址；`this` 是指向当前对象的引用，在区分局部变量和实例变量时不可省略。

---

## 一、对象和引用
- **对象**：`new` 出来的实例，存储在**堆内存**中
- **引用**：保存对象内存地址的变量，可以是局部变量（在栈中）或成员变量（在堆中）
- **空引用**：`null`，对空引用调用方法或访问属性会抛出 **空指针异常（NullPointerException）**

---

## 二、this 关键字

> this 是一个引用，保存了指向当前对象自身的内存地址。每个对象都有一个 this。

### 基本用法
```java
class Customer {
    String name;
    public Customer() {}

    public void shopping() {
        System.out.println(this.name + "正在购物！！！");
    }
}

public class Test {
    public static void main(String[] args) {
        String name = "张三";
        Customer a = new Customer();
        a.name = name;
        a.shopping();
    }
}
```

### this 何时不能省略？
当局部变量和实例变量**同名**时，`this.` 不可省略（受"就近原则"影响）：
```java
public class Student {
    private int num;
    private String name;

    public Student(String name, int num) {
        // name = name;   // 错误！就近原则，两边都是局部变量
        // num = num;     // 错误！同上
        this.name = name;  // 正确：this.name 是实例变量，name 是局部变量
        this.num = num;
    }
}
```

### this() —— 构造方法中调用另一个构造方法
- 只能出现在**构造方法的第一行**（且一次只能写一行）
- 目的是**代码复用**，避免多个构造方法写重复的初始化逻辑

```java
class Date {
    private int year, month, day;

    public Date() {
        // this.year = 1700; this.month = 12; this.day = 1;
        this(1700, 12, 1);  // 复用下面的三参数构造方法
    }

    public Date(int year, int month, int day) {
        this.year = year;
        this.month = month;
        this.day = day;
    }
}
```

### this 使用限制总结
| 规则 | 说明 |
|------|------|
| 不能出现在静态方法中 | 静态方法属于类，不涉及具体对象引用 |
| 大部分情况可省略 | 仅当局部变量和实例变量同名时不可省略 |
| this() 必须在构造方法第一行 | 且每个构造方法最多调用一次 |

---

## 关联上下文
- **前置知识**：理解 📋 待补充：Java内存模型与栈堆分配 对掌握对象引用的本质至关重要
- **横向对比**：与 C++ 的 `this` 指针对比，Java 的 `this` 是引用而非指针，更安全且无法进行指针运算
- **实际应用**：在 setter/getter 注入、构造方法参数与字段同名时的赋值、链式编程（`return this`）等场景广泛使用
- **进阶方向**：深入 📋 待补充：Java-面向对象-内部类与闭包 理解 this 在匿名内部类中的特殊语义
- **易混淆概念**：
  - **与 static 互斥**：带有 static 的方法不能直接访问实例变量或调用实例方法，因为静态方法没有 `this`

> 📂 所属：[[MOC - Java面向对象]]