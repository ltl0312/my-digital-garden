---
aliases: [泛型, 钻石表达式, foreach循环, 自定义泛型, 自动类型推断]
maturity: GROWING
tags:
  - status/已完成
  - type/笔记
  - Java/集合
created: "2026-06-16 10:00"
updated: "2026-06-16 15:00"
知识体系: "Java 后端 → L2 核心工具"
技术版本: "Java 17"
source: "00_Inbox/Java.md"
---
# Java 集合框架 — 泛型与 foreach

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L2 核心工具
- **上游依赖**：📋 待补充：Java基础语法 — 变量、类型、控制流是理解泛型语法的前提；📋 待补充：面向对象编程 — 类与接口继承是泛型边界的基础
- **下游延伸**：📋 待补充：Java函数式编程与Stream — Stream API 大量依赖泛型；📋 待补充：集合源码分析 — 理解底层实现依赖泛型擦除机制
- **同级技术**：<a href="obsidian://open?file=常用API与工具类">Java-常用API与工具类</a> — 同属 L2 核心工具层级，解决不同维度的开发效率问题

## 核心概念
> 泛型在编译期做类型检查，避免从集合取元素时的强制类型转换；foreach 是 JDK5 引入的简化遍历语法，缺点是没有下标。

---

## 一、泛型（Generic）

### 为什么需要泛型？
没有泛型时，从集合取出的元素都是 `Object` 类型，需要手动强制转换：
```java
List list = new ArrayList();
list.add("hello");
String s = (String) list.get(0);  // 必须强转，容易出错
```

有了泛型后：
```java
List<String> list = new ArrayList<>();
list.add("hello");
String s = list.get(0);  // 无需强转！编译期就确定了类型
```

### 钻石表达式（类型推断）
```java
// JDK8 之后，new 后面的 <> 中的类型可以省略
List<Animal> myList = new ArrayList<>();  // 编译器自动推断类型
```

### 自定义泛型
```java
// 类上定义泛型
public class MyClass<E> {
    public E doSomething() {
        return null;
    }
}
// 约定俗成的泛型字母：
// E = Element（集合元素）
// T = Type（通用类型）
// K = Key, V = Value（Map 键值）
```

### 泛型的局限性
- 泛型只在**编译期**有效（类型擦除）
- 不能使用基本数据类型作为泛型参数（必须用包装类，如 `List<Integer>`）

---

## 二、foreach（增强 for 循环）

```java
List<Integer> list = new ArrayList<>();
list.add(1);
list.add(2);

for (Integer i : list) {
    System.out.println(i);  // 简洁但无下标
}
```

### 优缺点

| 优点 | 缺点 |
|------|------|
| 代码简洁 | 没有下标，无法获取当前位置 |
| 避免了迭代器的样板代码 | 遍历中不能修改集合（会抛 ConcurrentModificationException） |
| entrySet + foreach 是遍历 Map 的最高效方式 | 无法倒序遍历 |

---

### 跨学科溯源（如适用）
> 本技术为工程实践，无直接跨学科来源。

---

## 关联上下文
- **包装类**：泛型不支持基本数据类型，必须用包装类替代（`int` → `Integer`），详见 <a href="obsidian://open?file=常用API与工具类">Java-常用API与工具类</a>
- **钻石表达式**：是 JDK8 的类型推断增强，与 Lambda 表达式同时代引入
- **前置知识**：📋 待补充：Java基础语法 — 变量声明与类型系统是理解泛型参数的基础
- **横向对比**：📋 待补充：数组与集合选型 — 泛型集合相比数组提供了编译期类型安全，但失去了协变性
- **实际应用**：📋 待补充：企业级CRUD最佳实践 — DAO 层通过泛型抽取公共接口，消除重复的类型转换代码
- **进阶方向**：📋 待补充：Java泛型高级应用 — 通配符上下界、类型擦除机制、桥接方法等进阶主题
- **易混淆概念**：📋 待补充：泛型与多态 — 泛型不是协变的（`List<String>` 不是 `List<Object>` 的子类型），新手常将此与继承多态混淆

> 📂 所属：[[MOC - 异常与集合]]