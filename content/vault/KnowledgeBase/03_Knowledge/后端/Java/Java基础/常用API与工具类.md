---
aliases: [常用API, System, Arrays, String方法, Integer, Date, DecimalFormat, BigDecimal, Random, Enum]
tags:
  - status/已完成
  - type/笔记
  - Java/基础
created: "2026-06-16 10:00"
updated: "2026-06-16 15:00"
知识体系: "Java 后端 → L0 语言基础"
技术版本: "Java 17"
source: "00_Inbox/Java.md"
---
# Java 常用 API 与工具类

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L0 语言基础
- **上游依赖**：无（本技术为 Java SE 入门级知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> 掌握 Java 常用工具类是高效编码的基础。String/Integer/Date/BigDecimal/Enum 等是日常开发中最频繁使用的类型。

---

## 一、System 类

| 方法 | 说明 |
|------|------|
| `System.arraycopy(src, srcPos, dest, destPos, length)` | 数组拷贝（native 方法，高效） |
| `System.currentTimeMillis()` | 获取当前毫秒数（自 1970-01-01 00:00:00） |
| `System.gc()` | **建议**启动垃圾回收（不保证立刻执行） |
| `System.exit(0)` | 退出 JVM（0 = 正常退出） |

---

## 二、Arrays 工具类

```java
int[] arr = {3, 1, 4, 1, 5};
Arrays.sort(arr);                        // 升序排序
int index = Arrays.binarySearch(arr, 4); // 二分查找（数组必须先排序！）
// 返回 -1 表示不存在
```

---

## 三、String 常用方法

| 方法 | 说明 |
|------|------|
| `charAt(int index)` | 获取指定位置字符，"中国人".charAt(1) → "国" |
| `compareTo(String s)` | 字典序比较，相等返回 0 |
| `contains(CharSequence s)` | 是否包含子串 |
| `endsWith(String s)` / `startsWith(String s)` | 判断前缀/后缀 |
| `equalsIgnoreCase(String s)` | 忽略大小写比较 |
| `toLowerCase()` / `toUpperCase()` | 大小写转换 |
| `trim()` | 去除前后空白 |
| `getBytes()` | 转为 byte[] |
| `toCharArray()` | 转为 char[] |
| `indexOf(String s)` / `lastIndexOf(String s)` | 子串首次/末次出现位置 |
| `isEmpty()` | 是否为空字符串（`""`） |
| `length()` | 字符串长度（**是方法！** 数组的 length 是属性） |
| `replace(target, replacement)` | 替换字符串 |
| `split(String regex)` | 按正则分割，"1998-02-16".split("-") |
| `substring(int begin)` / `substring(int begin, int end)` | 截取（含 begin，不含 end） |
| `static valueOf(非字符串)` | 将任意类型转为 String |

---

## 四、包装类（8 种基本类型的对象形式）

| 基本类型 | 包装类型 | 父类 |
|----------|----------|------|
| byte | Byte | Number |
| short | Short | Number |
| int | **Integer** | Number |
| long | Long | Number |
| float | Float | Number |
| double | Double | Number |
| boolean | Boolean | Object |
| char | Character | Object |

### 装箱 / 拆箱
```java
// 装箱：基本类型 → 包装对象
Integer i = 10;         // 自动装箱（等价于 Integer.valueOf(10)）

// 拆箱：包装对象 → 基本类型
int a = i;              // 自动拆箱（等价于 i.intValue()）

Integer j = i + 1;      // i 先拆箱 → 10 + 1 = 11 → 再装箱

// 整数缓存：-128 ~ 127 之间的 Integer 对象被提前创建（整数型常量池）
Integer x = 127, y = 127;  System.out.println(x == y);  // true（缓存命中）
Integer x = 128, y = 128;  System.out.println(x == y);  // false（new 的新对象）
```

### 三者互转（String ↔ int ↔ Integer）
```java
// String → int
int i = Integer.parseInt("100");

// int → String
String s = String.valueOf(i);
String s = i + "";

// int → Integer（自动装箱）
Integer ie = i;

// Integer → int（自动拆箱）
int i2 = ie;

// String → Integer
Integer ie2 = Integer.valueOf("100");

// Integer → String
String s2 = String.valueOf(ie2);
```

---

## 五、StringBuffer 与 StringBuilder

| 维度 | String | StringBuffer | StringBuilder |
|------|--------|-------------|---------------|
| 可变性 | 不可变 | 可变 | 可变 |
| 线程安全 | - | ✅（synchronized） | ❌ |
| 效率 | 拼接时低（每次创建新对象） | 中 | 高 |
| 初始容量 | - | 16 | 16 |
| 底层 | final byte[] | byte[] | byte[] |

```java
StringBuffer sb = new StringBuffer(50);  // 预估容量优化：减少扩容次数
sb.append("hello");
sb.append(123);
sb.append(true);
String result = sb.toString();
```

> **需要频繁字符串拼接时**：局部变量用 `StringBuilder`（无线程安全问题，效率最高）；多线程共享用 `StringBuffer`。

---

## 六、日期相关类

```java
// Date → String
Date now = new Date();
SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss SSS");
String timeStr = sdf.format(now);

// String → Date
String time = "2009-12-30 08:08:08 888";
Date d = sdf.parse(time);

// 毫秒 → Date
Date d = new Date(System.currentTimeMillis());
```

---

## 七、数字相关类

### DecimalFormat（数字格式化）
```java
// # = 任意数字  , = 千分位  . = 小数点  0 = 不足时补0
DecimalFormat df = new DecimalFormat("###,###.0000");
df.format(1234567.89);  // "1,234,567.8900"
```

### BigDecimal（高精度财务计算）
```java
BigDecimal v1 = new BigDecimal("100");   // 用 String 构造避免精度丢失！
BigDecimal v2 = new BigDecimal("200");
v1.add(v2);       // +（注意：BigDecimal 是不可变对象）
v1.subtract(v2);  // -
v1.multiply(v2);  // ×
v1.divide(v2);    // ÷
```

> **重要**：构建 BigDecimal 时用字符串构造器，而不是 double 构造器，否则会有精度丢失。

---

## 八、Random（随机数）

```java
Random random = new Random();
int num = random.nextInt();       // int 范围内的随机数
int num2 = random.nextInt(100);   // [0, 100) 范围内的随机数
```

---

## 九、枚举（Enum）

> 当判断结果的可能性在两个以上（boolean 不够用时），使用枚举。

```java
enum Result {
    SUCCESS, FAIL
}

// 实际应用：方法返回枚举而非 boolean
public static Result divide(int a, int b) {
    try {
        int c = a / b;
        return Result.SUCCESS;
    } catch (Exception e) {
        return Result.FAIL;
    }
}
```

枚举特性：
- 编译后生成 .class 文件
- 是一种引用数据类型
- 每个枚举值都可以看作常量
- 只有能"一枚一枚列举出来"的有限集合，才适合用枚举

---

## 十、常见运行时异常速查

| 异常 | 触发场景 |
|------|----------|
| `ClassCastException` | 类型转换错误 |
| `NullPointerException` | 空引用调用方法/属性 |
| `ArrayIndexOutOfBoundsException` | 数组越界 |
| `NumberFormatException` | 数字格式化异常（如 "abc" → Integer.parseInt） |
| `ArithmeticException` | 分母为零 |
| `ConcurrentModificationException` | 迭代器遍历中直接用集合对象修改 |

---

## 关联上下文
- **前置知识**：<a href="obsidian://open?file=数据类型与类型转换">Java-数据类型与类型转换</a> 基本数据类型是包装类的基础；<a href="obsidian://open?file=Object类与String基础">Java-Object类与String基础</a> String 不可变性是所有字符串操作的底层原理
- **横向对比**：📋 待补充：Java-StringBuilder与StringBuffer对比 局部无竞争用 StringBuilder，多线程共享用 StringBuffer；SimpleDateFormat 非线程安全，推荐 Java 8 的 DateTimeFormatter
- **实际应用**：📋 待补充：Java-金额计算 BigDecimal 是财务系统必选项；SimpleDateFormat 用于日期格式化交互；Random 用于测试数据生成和验证码
- **进阶方向**：📋 待补充：Java-新日期时间API Java 8 的 java.time 包（LocalDate/LocalDateTime/DateTimeFormatter）全面替代 Date+SimpleDateFormat；📋 待补充：Java-StreamAPI 结合集合与工具类进行函数式数据处理
- **易混淆概念**：包装类的 `==` 与 `equals()` 区别（-128~127 缓存范围内可用 `==`，范围外必须用 `equals`）

> 📂 所属：[[MOC - Java基础]]