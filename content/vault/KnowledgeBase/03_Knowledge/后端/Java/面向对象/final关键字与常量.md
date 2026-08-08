---
aliases: [final关键字, Java常量, static final, 不可变]
tags:
  - status/已完成
  - type/笔记
  - Java/OOP
created: "2026-06-16 10:00"
updated: "2026-06-16 15:00"
知识体系: "Java 后端 → L1 面向对象"
技术版本: "Java 17"
source: "00_Inbox/Java.md"
---
# Java 面向对象 — final 关键字与常量

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L1 面向对象
- **上游依赖**：📋 待补充：Java基本语法 变量声明、数据类型、运算符等基础语法是理解 final 修饰变量的前提
- **下游延伸**：📋 待补充：Java不可变集合 从 final 引用到不可变集合的设计思想
- **同级技术**：📋 待补充：Java访问控制修饰符 与 final 共同构成类的访问与修改控制体系

## 核心概念
> `final` 表示"最终、不可变"：修饰的类无法继承，方法无法覆盖，变量赋值后不可改变。`static final` 组合定义真正的常量。

---

## 一、final 修饰的三类目标

| 修饰目标 | 效果 |
|----------|------|
| **类** | 不能被继承（如 `String` 就是 final 类） |
| **方法** | 不能被覆盖/重写 |
| **局部变量** | 一旦赋值，不能再修改 |
| **引用变量** | 指向对象的地址不可变（但对象内部状态可变） |
| **实例变量** | 必须由程序员手动赋值（JVM 不给默认值） |

### final 修饰实例变量的特殊规则
```java
class User {
    final double height = 1.8;   // ✅ 声明时赋值
    final double weight;         // ❌ 编译错误！系统不给 final 实例变量赋默认值

    public User() {
        weight = 0.8;            // ✅ 在构造方法中赋值（手动赋值优先于系统默认值）
    }
}
```

---

## 二、常量（static final）

> 单独 `final` 修饰实例变量，每个对象都有一份副本，浪费堆内存。
> 所以 `final` 通常与 `static` 联用，形成**常量**：存储在方法区，全类共享一份。

```java
class Chinese {
    // 普通人写法 —— 每个中国人对象都存一份 "中国"，浪费！
    final String country = "中国";

    // 正确写法 —— 常量，方法区只存一份
    public static final String COUNTRY = "中国";
}
```

### 常量命名规范
- **全部大写**
- **单词之间用下划线连接**，如：`MAX_VALUE`、`DEFAULT_CAPACITY`
- 常量一般用 `public` 修饰——因为公开了你也改不了，无须封装

### 常量、静态变量和实例变量的比较

| 类型 | 存储位置 | 初始化时机 | 共享性 |
|------|----------|------------|--------|
| 实例变量 | 堆（每个对象一份） | new 对象时 | 不共享 |
| 静态变量 | 方法区 | 类加载时 | 全类共享 |
| 常量（static final） | 方法区 | 类加载时 | 全类共享且不可变 |

---

## 三、final 和 abstract 的对立关系

```
final    → 阻止继承、阻止覆盖 → "到此为止"
abstract → 必须被继承、必须被覆盖 → "等你来填"

二者永远不能同时出现！
```

---

## 关联上下文
- **前置知识**：📋 待补充：Java基本语法 变量声明、数据类型、访问修饰符等基础语法是学习 final 的前提
- **横向对比**：📋 待补充：Java访问控制修饰符 final 控制不可变性，访问修饰符控制可见性，二者共同构成类成员的修饰体系
- **实际应用**：📋 待补充：Java常量最佳实践 final 和 static final 在配置常量、工具类、数学常量中的典型应用场景
- **进阶方向**：📋 待补充：Java不可变对象设计 从 final 变量到不可变类、防御性拷贝的进阶设计思想
- **易混淆概念**：<a href="obsidian://open?file=异常处理">Java-异常处理</a> finally（异常确保块）和 finalize（GC 回调）与 final 含义完全不同，仅名字相似
- **String 是 final 类**：所以 String 不可被继承，保证了安全和不可变性，详见 <a href="obsidian://open?file=常用API与工具类">Java-常用API与工具类</a>
- **finally 与 finalize**：名字相似但完全不同 —— `finally` 是异常处理的确保执行块，`finalize` 是 GC 回调方法，详见 <a href="obsidian://open?file=异常处理">Java-异常处理</a>

> 📂 所属：[[MOC - Java面向对象]]