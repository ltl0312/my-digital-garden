---
aliases: [Java继承, super关键字, extends, 构造方法调用链]
maturity: GROWING
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
# Java 面向对象 — 继承与 super 关键字

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L1 面向对象
- **上游依赖**：Java SE 语法基础（L0）：数据类型、运算符、控制流、方法、数组
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> 继承（extends）让子类复用父类的代码，但带来高耦合；`super` 代表当前对象中父类类型的特征，不是引用，必须后跟 `.` 或 `()`。

---

## 一、继承的基本认知
- **本质**：子类继承父类 = 把父类的代码"复制"一份到子类中（逻辑上如此，实际不显示）
- **缺点**：耦合度太高，父子类高度绑定
- **使用准则**：只有满足 **"is a"** 关系时才用继承
  - ✅ 猫是一个动物（Cat extends Animal）
  - ✅ 信用卡账户是一个银行账户（CreditAccount extends BankAccount）
  - ✅ 白菜是一种蔬菜
  - ❌ 仅仅为了代码复用而继承，会破坏架构

---

## 二、super 关键字

> super 不是一个引用，不保存内存地址，也不指向任何对象。它只是代表当前对象内部那一块**父类型的特征**。

### super 的使用规则（与 this 对称比较）

| 规则 | this | super |
|------|------|-------|
| 出现在实例方法和构造方法中 | ✅ | ✅ |
| 语法形式 | `this.` / `this()` | `super.` / `super()` |
| 出现在静态方法中 | ❌ | ❌ |
| 大部分情况可省略 | ✅ | ✅（除非父子类有同名属性时访问父类的） |
| 出现在构造方法第一行 | ✅ | ✅（隐式存在） |

### 构造方法调用链（经典面试题）

**规则：子类构造方法的第一行隐含 `super()`，调用父类无参构造。**

```java
class A {
    public A() { System.out.println("A的无参数构造方法"); }  // ①
}
class B extends A {
    public B() {
        // super();  // 隐式存在
        System.out.println("B的无参数构造方法");             // ②
    }
    public B(String name) {
        System.out.println("B的有参数构造方法(String)");     // ③
    }
}
class C extends B {
    public C() {
        this("name");                                      // 调用了 C(String)
        System.out.println("C的无参数构造方法");             // ④
    }
    public C(String name) {
        this(name, 18);                                    // 调用了 C(String, int)
        System.out.println("C的有参数构造方法(String)");     // ⑤
    }
    public C(String name, int age) {
        super(name);                                       // 调 B(String) → A()
        System.out.println("C的有参数构造方法(String, age)");// ⑥
    }
}
// new C() 的输出顺序：① → ③ → ⑥ → ⑤ → ④
```

> **"要有儿子，必须先有老子"**：JVM 创建子类对象前必须先创建父类对象。

### 访问父类的 private 属性
父类的 private 属性只能在本类中访问，子类需要通过 `super(参数)` 调用父类的有参构造方法来间接"继承"：
```java
class Customer {
    private String name;
    public Customer(String name) {
        this.name = name;
    }
}
class Vip extends Customer {
    public Vip(String name) {
        super(name);  // 通过父类构造方法传递 name
    }
}
```

### this 和 super 的一道重要辨析
```java
class Vip extends Customer {
    // 如果这里写 private String name; ← 则 this.name 和 super.name 指向不同的变量
    public void shopping() {
        System.out.println(this.name + "正在购物");   // 子类的 name（默认 this）
        System.out.println(super.name + "正在购物");  // 父类的 name
        System.out.println(name + "正在购物");        // 默认 == this.name
    }
}
```
如果子类没有定义 `name` 属性，`this.name`、`super.name`、`name` 三者都指向父类的 `name`。

---

## 三、静态代码块与普通代码块
```java
// 静态代码块 → 类加载时执行一次（类加载时机）
static {
    System.out.println("类加载时执行且只执行一次");
}

// 构造代码块 → 每次 new 对象时，在构造方法之前执行
{
    System.out.println("每次构造前执行");
}
```

---

## 关联上下文
- **前置知识**：先掌握对象与 this 的基本概念，详见 <a href="obsidian://open?file=对象与this关键字">Java-面向对象-对象与this关键字</a>
- **实际应用**：模板方法模式、框架扩展点等场景，详见 📋 待补充：Java-设计模式-模板方法
- **进阶方向**：继承是实现多态的基础，详见 📋 待补充：Java-多态与重写

> 📂 所属：[[MOC - Java面向对象]]