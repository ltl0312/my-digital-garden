---
aliases: [Java集合, Collection, List, ArrayList, LinkedList, Vector]
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
# Java 集合框架 — Collection 与 List

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L2 核心工具
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：并发集合（ConcurrentHashMap）、MyBatis-Plus 批量操作（L3）、Redis 数据结构（L5）
- **同级技术**：IO 流（L2）、多线程（L2）、反射与注解（L2）

## 核心概念
> 集合存储的是引用数据类型（对象的内存地址）。List 有序可重复、有下标；ArrayList 底层是数组（检索快），LinkedList 底层是双向链表（增删快）。

---

## 一、Collection 继承体系

```
Iterable（Iterator 方法）
  └── Collection 接口
        ├── List 接口（有序可重复，有下标）
        │     ├── ArrayList（数组，非线程安全）
        │     ├── LinkedList（双向链表）
        │     └── Vector（数组，线程安全，已过时）
        └── Set 接口（无序不可重复，无下标）
              ├── HashSet（HashMap 底层，哈希表）
              └── SortedSet → TreeSet（TreeMap 底层，二叉树，自动排序）
```

> 集合中不能存储基本数据类型，只能存储**对象的内存地址**。

---

## 二、Collection 通用方法

| 方法 | 说明 |
|------|------|
| `boolean add(E e)` | 添加元素 |
| `int size()` | 当前元素个数（非容量） |
| `void clear()` | 清空集合 |
| `boolean contains(Object o)` | 是否包含（底层调用 equals） |
| `boolean remove(Object o)` | 删除元素（底层调用 equals） |
| `boolean isEmpty()` | 是否为空 |
| `Object[] toArray()` | 转为数组 |
| `Iterator iterator()` | 获取迭代器 |

### 核心原则：存入集合的类型必须重写 equals()
```java
// contains 和 remove 的底层都依赖 equals 方法
Collection c = new ArrayList();
String s1 = new String("abc");
c.add(s1);
String x = new String("abc");
System.out.println(c.contains(x));  // true，因为 String 重写了 equals

// 自定义对象必须重写 equals，否则 contains/remove 会比较内存地址！
```

---

## 三、List 特有方法

| 方法 | 说明 |
|------|------|
| `void add(int index, E e)` | 指定位置插入（效率低，不常用） |
| `E get(int index)` | 按索引获取（List 独有的遍历方式） |
| `int indexOf(Object o)` | 首次出现位置 |
| `int lastIndexOf(Object o)` | 末次出现位置 |
| `E remove(int index)` | 按索引删除 |
| `E set(int index, E e)` | 修改指定位置元素 |

---

## 四、三大 List 实现类对比

| 维度 | ArrayList | LinkedList | Vector |
|------|-----------|------------|--------|
| 底层结构 | Object[] 数组 | 双向链表 | Object[] 数组 |
| 初始容量 | 10（延迟初始化） | 无 | 10 |
| 扩容倍数 | 1.5 倍 | 无（链表无须扩容） | 2 倍 |
| 线程安全 | ❌（需 `Collections.synchronizedList`） | ❌ | ✅（synchronized） |
| 检索效率 | ⭐⭐⭐⭐⭐ O(1) | ⭐（从头部遍历） | ⭐⭐⭐⭐⭐ |
| 随机增删 | ⭐（需移动元素） | ⭐⭐⭐⭐⭐ | ⭐ |
| 尾部增删 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### ArrayList 扩容细节
- **实际机制**：先创建容量为 0 的数组，添加第一个元素时才初始化为 10
- 超过容量时扩容为原来的 **1.5 倍**
- 优化建议：如果能预估数据量，用带 int 参数的构造方法指定初始容量，减少扩容次数

### 线程安全转换
```java
List l = new ArrayList();
List syncList = Collections.synchronizedList(l);  // 获得线程安全视图
```

---

## 五、链表基础（LinkedList 核心）

```java
// 单链表的简化实现
class Node {
    public Object data;
    public Node next;
    public Node(Object data, Node next) {
        this.data = data;
        this.next = next;
    }
}
class Link {
    Node header = null;
    Node end = null;
    int size = 0;

    public void add(Object obj) {
        if (header == null) {
            header = new Node(obj, null);
            end = header;
        } else {
            Node newNode = new Node(obj, null);
            end.next = newNode;
            end = newNode;
        }
        size++;
    }
}
```

> **关键认知**：LinkedList 也有下标（List 接口要求），但检索仍然慢 —— 因为它需要从头节点逐个遍历，不能像数组那样用数学公式直接定位。

---

## 六、迭代器遍历

```java
Collection c = new HashSet();
c.add("aa");
c.add("abb");

Iterator i = c.iterator();
while (i.hasNext()) {
    Object obj = i.next();
    System.out.println(obj);

    // ❌ 错误：遍历中直接用集合对象删除，会抛 ConcurrentModificationException
    // c.remove(obj);

    // ✅ 正确：使用迭代器自己的 remove 方法
    i.remove();
}
```

---

## 关联上下文
- **前置知识**：理解 📋 待补充：Java面向对象基础 中的继承、接口概念是学习集合框架的前提
- **横向对比**：相比数组，List 集合提供动态扩容和丰富 API；相比 📋 待补充：Java-Stream-API，集合框架更侧重数据存储而非函数式变换
- **实际应用**：日常业务开发中最常用的数据结构，用于数据缓存、DTO 传输、批量处理等场景
- **进阶方向**：深入 📋 待补充：Java-并发集合（CopyOnWriteArrayList、ConcurrentHashMap）了解线程安全集合
- **易混淆概念**：区分 Collection（根接口）与 Collections（工具类），前者是集合框架顶层接口，后者是操作集合的静态方法工具类
- **数组**：ArrayList 的底层，检索快增删慢的根本原因，详见 <a href="obsidian://open?file=数组">Java-数组</a>

> 📂 所属：[[MOC - 异常与集合]]