---
aliases: [Java集合避坑, subList陷阱, toArray, equals与hashCode规则, 集合遍历安全]
maturity: GROWING
tags:
  - status/待处理
  - type/笔记
  - Java/规范
  - Java/集合
created: "2026-06-16 11:00"
updated: "2026-06-16 15:00"
知识体系: "Java 后端 → L2 核心工具"
技术版本: "Java 17 / 阿里巴巴嵩山版 v1.7.0"
source: "阿里巴巴Java开发手册-嵩山版（已归档）"
---

# 阿里巴巴 Java 开发手册 — 集合处理避坑指南

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L2 核心工具
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> 阿里巴巴手册中集合相关的规约是最密集的"事故高发区"，几乎每一条背后都有线上血泪史。核心主题是：equals/hashCode 要同时重写、subList/toArray 有隐蔽陷阱、foreach 中不可修改集合、Map 的遍历要用 entrySet。

---

## 一、equals 与 hashCode 的铁律

### 强制规则
- **只要重写 equals，必须重写 hashCode**
- 如果 equals 为 true 的两个对象，hashCode 必须相同
- Set 依靠 hashCode + equals 共同保证去重
- Map 的 key 依靠 hashCode 定位桶，equals 比对具体值

### 避免 NPE 的 equals 写法
```java
// ✅ 推荐：常量或确定非 null 的对象调 equals
"test".equals(object);

// ✅ JDK7+ 推荐
java.util.Objects.equals(object1, object2);
```

### Integer 缓存陷阱
```java
Integer var = ?;
// -128 ~ 127 之间走 IntegerCache，== 可能返回 true
// 超出范围则 new 新对象，== 返回 false
// 结论：Integer 之间比较永远用 equals，不要用 ==
```

---

## 二、浮点数的比较铁律

```java
float a = 1.0F - 0.9F;
float b = 0.9F - 0.8F;
// a == b  → false！浮点数有精度损失
// equals 同样 → false！
```

### ✅ 正确做法
```java
// 方法一：误差范围法
float diff = 1e-6F;
if (Math.abs(a - b) < diff) { /* 视为相等 */ }

// 方法二：使用 BigDecimal（推荐，但必须用 String 构造器！）
BigDecimal x = new BigDecimal("1.0");
BigDecimal y = new BigDecimal("0.9");
// ❌ BigDecimal(double) 仍有精度问题
// ✅ 用 String 或 BigDecimal.valueOf()
BigDecimal recommend1 = new BigDecimal("0.1");
BigDecimal recommend2 = BigDecimal.valueOf(0.1);
```

### BigDecimal 比较用 compareTo 而非 equals
- `equals` 会比较精度：`1.0` 和 `1.00` → false
- `compareTo` 忽略精度：`1.0` 和 `1.00` → 0（相等）

---

## 三、ArrayList 的 subList 陷阱（线上高频事故）

### 惊悚事实
```java
List<Integer> list = new ArrayList<>();
list.add(1); list.add(2); list.add(3);

List<Integer> sub = list.subList(0, 2);
// sub 并不是 ArrayList！是内部类 SubList

// ❌ 场景1：强制转换为 ArrayList → ClassCastException
ArrayList<Integer> arr = (ArrayList<Integer>) sub; // 炸！

// ❌ 场景2：修改原 list → 遍历 sub 抛 ConcurrentModificationException
list.add(4);
for (Integer i : sub) { } // 炸！

// ❌ 场景3：修改 sub → 原 list 也跟着变（subList 是视图！）
sub.set(0, 999);
System.out.println(list.get(0)); // 999
```

---

## 四、toArray 的正确用法

```java
List<String> list = new ArrayList<>();
list.add("a"); list.add("b");

// ❌ 错误：toArray() 无参 → 返回 Object[]，强转炸 ClassCastException
String[] arr1 = (String[]) list.toArray();

// ✅ 正确：传入长度为 0 的模板数组（最推荐，性能最优）
String[] arr2 = list.toArray(new String[0]);
```

> `toArray(new T[0])` 比 `new T[size]` 更优：JDK 内部直接用反射创建正确大小的数组，省去扩容开销。

---

## 五、foreach 中不可 remove/add

```java
List<String> list = new ArrayList<>();
list.add("1"); list.add("2");

// ❌ 错误
for (String item : list) {
    if ("1".equals(item)) {
        list.remove(item);  // ConcurrentModificationException！
    }
}

// ✅ 正确：使用 Iterator 的 remove
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    String item = it.next();
    if ("1".equals(item)) {
        it.remove();  // 安全
    }
}
```

---

## 六、Map 遍历与 null 处理

### entrySet 优先于 keySet
```java
// ✅ entrySet：一次性能直接取 key + value
for (Map.Entry<K, V> entry : map.entrySet()) {
    K key = entry.getKey();
    V value = entry.getValue();
}

// ❌ keySet：需要二次查询 Map
for (K key : map.keySet()) {
    V value = map.get(key);  // 多一次 hash 查找
}
```

### Map 的 null 容忍度速查

| Map 类型 | Key 可为 null | Value 可为 null |
|----------|---------------|------------------|
| HashMap | ✅ | ✅ |
| ConcurrentHashMap | ❌ (NPE) | ❌ (NPE) |
| HashTable | ❌ (NPE) | ❌ (NPE) |
| TreeMap | ❌ (NPE) | ✅ |

---

## 七、Arrays.asList() 的三大坑

```java
String[] str = {"chen", "yang", "hao"};
List list = Arrays.asList(str);

// 坑1：返回的是 Arrays 内部类，不是 ArrayList → add/remove/clear 抛异常
list.add("new");  // UnsupportedOperationException！

// 坑2：修改原数组 → list 也变（是视图）
str[0] = "change";
System.out.println(list.get(0)); // "change"

// 坑3：基本类型数组被当成单个元素
int[] ints = {1, 2, 3};
List list2 = Arrays.asList(ints);
System.out.println(list2.size()); // 1  ← 整个 int[] 是一个元素！
```

---

## 关联上下文
- **前置知识**：需掌握 Java 集合框架基本接口与实现类，详见 📋 待补充：Java集合框架基础
- **横向对比**：阿里巴巴手册集合规约与 Google Guava 集合工具的设计取舍，详见 📋 待补充：阿里巴巴手册vsGuava对比
- **实际应用**：日常业务 CRUD 中集合增删改查的正确实践，详见 📋 待补充：集合操作实战场景
- **进阶方向**：深入并发集合与不可变集合等高级主题，详见 📋 待补充：Java并发与不可变集合
- **易混淆概念**：Collection 接口与 Collections 工具类、subList 视图与副本等易错点，详见 📋 待补充：Java集合易混淆概念
- **完整手册母体**：本笔记源自 阿里巴巴Java开发手册-嵩山版（已归档）
- **equals 与 hashCode 原理**：为什么这两个方法必须同时重写，详见 <a href="obsidian://open?file=Object类与String基础">Java-Object类与String基础</a> 和 <a href="obsidian://open?file=集合框架-Map详解">Java-集合框架-Map详解</a>
- **ArrayList 源码机制**：subList 返回视图而非副本的底层原因，详见 <a href="obsidian://open?file=集合框架-Collection与List">Java-集合框架-Collection与List</a>
> 📂 所属：[[MOC - 开发手册]]