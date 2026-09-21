---
aliases: [对象序列化, Serializable, serialVersionUID, Properties, File类, 配置文件]
maturity: GROWING
tags:
  - status/已完成
  - type/笔记
  - Java/IO
created: "2026-06-16 10:00"
updated: "2026-06-16 15:00"
知识体系: "Java 后端 → L2 核心工具"
技术版本: "Java 17"
source: "00_Inbox/Java.md"
---
# Java IO 流 — 序列化、Properties 与 File 类

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L2 核心工具
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：集合框架（L2）、多线程（L2）、反射（L2）

## 核心概念
> 序列化将内存中的 Java 对象持久化到硬盘；Properties 提供 key=value 格式的配置文件读写；File 类是对文件路径的抽象表示。

---

## 一、对象的序列化与反序列化

### 基本概念
- **序列化（Serialize）**：内存中的 Java 对象 → 硬盘文件（ObjectOutputStream 拆分）
- **反序列化（Deserialize）**：硬盘文件 → 内存中的 Java 对象（ObjectInputStream 组装）

### 序列化操作
```java
// 1. 写对象（序列化）
Student stu = new Student("zhangsan");
ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("studentFile"));
oos.writeObject(stu);
oos.flush();
oos.close();

// 2. 读对象（反序列化）
ObjectInputStream ois = new ObjectInputStream(new FileInputStream("studentFile"));
Student s = (Student) ois.readObject();
ois.close();
```

### 必要条件
- 被序列化的类必须实现 **Serializable** 接口（这是一个**标志性接口**，没有任何方法）
- JVM 看到该类实现了 Serializable，会自动生成序列化版本号

### 一次序列化多个对象
**不要逐个序列化**，第二个对象会报错。正确做法：将对象放入集合，序列化集合即可。
```java
List<Student> list = new ArrayList<>();
list.add(new Student("张三"));
list.add(new Student("李四"));
oos.writeObject(list);  // 序列化整个集合
```
集合中所有元素也必须实现 Serializable。

---

## 二、transient 关键字

```java
private int age;          // 正常序列化
private transient int age; // 标记为"游离的"，不参与序列化
```
被 `transient` 修饰的变量不参与序列化，反序列化后该变量为**默认值**（int 为 0，对象为 null）。

---

## 三、序列化版本号（重点）

### 为什么需要手动指定？
```
场景：
  10 年前 → 写了一个 Student 类，序列化保存到硬盘
  10 年后 → Student 类修改了（加了字段/改了方法）
           反序列化时报错：java.io.InvalidClassException
  
原因：类修改后重新编译，JVM 自动生成的序列化版本号变了，
      JVM 认为这是"不同的类"
```

### Java 区分不同类的两个条件
1. **类名不同** → 肯定不是同一个类
2. **类名相同 + 序列化版本号不同** → 也不是同一个类

### 终极解决方案
```java
public class Student implements Serializable {
    private static final long serialVersionUID = 1L;  // 手动固定，永远不变
    // ...
}
```

**IDEA 设置自动提示**：Settings → Editor → Inspections → 搜索 `Serializable class without 'serialVersionUID'`

---

## 四、Properties + IO 流（配置文件模式）

### 配置文件格式
```
# 注释用 #
username=admin
password=123
```

### 读取配置文件
```java
// 方式一：InputStream 加载
FileInputStream in = new FileInputStream("file.properties");
Properties pro = new Properties();
pro.load(in);                              // = 左边是 key，右边是 value
String username = pro.getProperty("username");
in.close();

// 方式二：资源绑定器（更简洁）
ResourceBundle bundle = ResourceBundle.getBundle("filename");  // 不加 .properties 后缀
String className = bundle.getString("Key");
```

### 设计理念
> 经常需要修改的数据单独写在文件中，程序动态读取。这就是**配置文件**的核心思想。

Java 规范建议属性配置文件以 `.properties` 为后缀（非强制）。

---

## 五、File 类

> File 是文件和目录路径名的抽象表示，与四大流**没有继承关系**。

### 常用方法

| 方法 | 说明 |
|------|------|
| `exists()` | 判断文件/目录是否存在 |
| `createNewFile()` | 创建文件 |
| `mkdir()` / `mkdirs()` | 创建目录 / 创建多级目录 |
| `getParent()` / `getParentFile()` | 获取父路径 |
| `getAbsolutePath()` | 获取绝对路径 |
| `getName()` | 获取文件名 |
| `isFile()` / `isDirectory()` | 判断是文件还是目录 |
| `lastModified()` | 最后修改时间（毫秒，自1970） |
| `length()` | 文件字节数 |
| `listFiles()` | 获取子文件/子目录数组 |

---

## 跨学科溯源
> 沿 03_Knowledge/技术划分.md 跨学科纵深追溯：Java 序列化机制 → JVM 规范（对象内存布局与元数据） → 计算机组成原理（数据持久化与字节编码）。

本技术为 Java 语言层面的工程实践，其核心依赖是 JVM 对对象结构的元数据描述能力，无更深层的跨学科来源。

---

## 关联上下文
- **前置知识**：需要先掌握 <a href="obsidian://open?file=IO流体系">Java-IO流体系</a> 的基本概念，理解字节流与字符流的区别
- **横向对比**：相比 JSON、XML 等序列化格式，Java 原生序列化更简便但跨语言能力弱；Properties 专为简单 key-value 配置设计，比 YAML/JSON 配置文件更轻量
- **实际应用**：分布式系统 RPC 调用中的对象传输、Session 持久化、游戏存档等需要保存对象状态的场景
- **进阶方向**：深入学习 📋 待补充：Spring-配置管理 中的 PropertySource 机制，或了解 Protobuf/JSON 等跨语言序列化方案
- **易混淆概念**：序列化与编码转换不同——序列化保存对象完整状态（含类型信息），而编码转换仅变更字节表示格式

> 📂 所属：[[MOC - IO流]]
