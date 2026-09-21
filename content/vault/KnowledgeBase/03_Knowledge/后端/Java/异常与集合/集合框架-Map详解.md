---
aliases: [HashMap, TreeMap, HashTable, Properties, 哈希表, 红黑树转换]
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
# Java 集合框架 — Map 详解

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L2 核心工具
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：并发集合（ConcurrentHashMap）、MyBatis-Plus 批量操作（L3）、Redis 数据结构（L5）
- **同级技术**：IO 流（L2）、多线程（L2）、反射与注解（L2）

## 核心概念
> Map 以键值对（Key-Value）存储对象的内存地址。Key 无序不可重复（与 Set 特性一致），HashMap 底层是哈希表，TreeMap 底层是二叉树。

---

## 一、Map 继承体系

```
Map 接口
  ├── HashMap（哈希表，非线程安全，Key/Value 可为 null）
  │     └── LinkedHashMap
  ├── HashTable（哈希表，线程安全，Key/Value 都不能为 null，已过时）
  │     └── Properties（属性类，Key 和 Value 都必须是 String）
  └── SortedMap 接口
        └── TreeMap（二叉树，Key 自动排序）
```

---

## 二、Map 常用方法

| 方法 | 说明 |
|------|------|
| `V put(K key, V value)` | 添加键值对 |
| `V get(Object key)` | 通过 key 获取 value |
| `V remove(Object key)` | 删除键值对 |
| `int size()` | 键值对数量 |
| `void clear()` | 清空 |
| `boolean containsKey(Object key)` | 是否包含 key（底层依赖 equals） |
| `boolean containsValue(Object value)` | 是否包含 value |
| `Set<K> keySet()` | 获取所有 key 的 Set |
| `Collection<V> values()` | 获取所有 value 的 Collection |
| `Set<Map.Entry<K,V>> entrySet()` | 将 Map 转为 Set（每个元素是 Entry） |

### Map 的三种遍历方式

```java
Map<Integer, String> map = new HashMap<>();
map.put(1, "zhangsan");
map.put(2, "wangwu");

// 方式一：keySet + 迭代器（或 foreach）
Set<Integer> set = map.keySet();
for (Integer key : set) {
    System.out.println(key + "=" + map.get(key));
}

// 方式二：entrySet + foreach（推荐，大数据量时效率最高）
Set<Map.Entry<Integer, String>> entrySet = map.entrySet();
for (Map.Entry<Integer, String> entry : entrySet) {
    System.out.println(entry.getKey() + "=" + entry.getValue());
}
// 为什么效率高？直接通过 Node 的属性值获取，不需要再查一次 Map

// 方式三：迭代器遍历 keySet
Iterator<Integer> it = map.keySet().iterator();
while (it.hasNext()) {
    Integer key = it.next();
    System.out.println(key + "=" + map.get(key));
}

// ⚠️ 注意：调用一次 next() 迭代器就前进一次！
// map.get(it.next()) 在循环中连续调用会跳过元素！
```

---

## 三、HashMap 核心原理（面试重点）

### 底层数据结构：哈希表（数组 + 链表 + 红黑树）

### put(k, v) 的实现原理
```
1. 将 k, v 封装到 Node 对象中
2. 调用 k.hashCode() 得到哈希值
3. 通过哈希算法将哈希值转换为数组下标
4. 如果该位置无元素 → 直接放入
   如果该位置有链表 → 用 k.equals() 逐一比较链表上每个 Node 的 key
     - 所有 equals 都返回 false → 新 Node 添加到链表末尾
     - 某个 equals 返回 true → 用新 value 替换旧 value
```

### get(k) 的实现原理
```
1. 调用 k.hashCode() 得到哈希值
2. 通过哈希算法转换为数组下标，快速定位
3. 如果该位置无元素 → 返回 null
   如果该位置有链表 → 用 k.equals() 逐一比较，找到就返回 value
   都找不到 → 返回 null
```

### HashMap 的关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 默认初始容量 | 16 | 必须是 2 的倍数（散列均匀的关键） |
| 默认加载因子 | 0.75 | 容量×0.75 = 扩容阈值 |
| 扩容倍数 | 2 倍 | 每次扩容容量翻倍 |
| 链表→红黑树阈值 | 8 | 单链表长度 ≥ 8 转为红黑树 |
| 红黑树→链表阈值 | 6 | 红黑树节点 ≤ 6 退化为链表 |

> **为什么初始容量必须是 2 的倍数？** 哈希算法 `hash & (n-1)` 在 n 为 2 的幂时，可以保证散列均匀，提高存取效率。

### 核心铁律
> **如果一个类的 equals 方法被重写，hashCode 方法也必须被重写！**

假设 hashCode 固定返回同一个值 → 所有元素落在一个桶 → 退化为纯单向链表 → 散列分布不均匀（性能灾难）。

---

## 四、HashTable vs HashMap

| 维度 | HashMap | HashTable |
|------|---------|-----------|
| 线程安全 | ❌ | ✅（synchronized，但效率低） |
| Key/Value null | ✅ 允许 | ❌ 都不允许 |
| 初始容量 | 16 | 11 |
| 扩容公式 | 原容量 × 2 | 原容量 × 2 + 1 |
| 使用建议 | 主流选择 | 已过时，被 ConcurrentHashMap 替代 |

---

## 五、Properties（属性类）

```java
// Properties 继承自 HashTable，Key 和 Value 都必须是 String
Properties pro = new Properties();
pro.setProperty("username", "admin");
pro.setProperty("password", "123");

String username = pro.getProperty("username");

// 从文件加载
FileInputStream in = new FileInputStream("config.properties");
pro.load(in);  // 文件中的 key=value 被加载到 Properties 对象
in.close();
```

---

## 关联上下文
- **前置知识**：掌握 <a href="obsidian://open?file=Object类与String基础">Java-Object类与String基础</a> 中的 equals 与 hashCode 约定，是正确使用 Map 的前提
- **横向对比**：同层级的 📋 待补充：List与Set选型对比 可对比三种集合体系的选型理由
- **实际应用**：缓存场景、配置加载（Properties）、数据分组聚合是 Map 最典型的落地场景
- **进阶方向**：深入学习 📋 待补充：ConcurrentHashMap与并发容器 掌握并发 Map 的实现原理
- **易混淆概念**：区分 Collection（单列集合）与 Map（双列集合）的设计定位

> 📂 所属：[[MOC - 异常与集合]]