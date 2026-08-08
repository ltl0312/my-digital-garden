---
aliases: [Java MOC, Java知识地图, Java后端知识体系]
tags:
  - status/进行中
  - type/MOC
  - Java
created: "2026-06-16 12:10"
updated: "2026-06-16 12:10"
知识体系: "Java 后端"
---

# MOC - Java 后端

> 本 MOC 汇总了 Java SE 核心知识体系，从基础语法到高级特性，从 OOP 思想到多线程并发，覆盖开发手册生产规范。分为 7 大主题 30 篇笔记。

---

## 目录结构

```
03_Knowledge/后端/Java/
├── MOC - Java后端.md                        ← 本文件
├── Java基础/                                  ← 7 篇
├── 面向对象/                                  ← 7 篇
├── 异常与集合/                                ← 5 篇
├── IO流/                                      ← 2 篇
├── 多线程/                                    ← 3 篇
├── 高级特性/                                  ← 2 篇
├── 开发手册/                                  ← 3 篇（阿里巴巴嵩山版）
└── SpringBoot/                                ← 物理子目录（逻辑上为独立的 L1 MOC，通过后端 MOC 接入）
```

---

## 一、Java 基础（7 篇）

> 详见 <a href="obsidian://open?file=MOC - Java基础">MOC - Java基础</a>

> 语言根基：从数据类型到常用 API。

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=数据类型与类型转换">Java-数据类型与类型转换</a> | 8 种基本类型大小排序、自动/强制类型转换规则、混合运算注意事项 |
| <a href="obsidian://open?file=运算符">Java-运算符</a> | 逻辑运算符的短路机制（&& vs &）、三元运算符、字符串连接符 `+` |
| <a href="obsidian://open?file=控制语句">Java-控制语句</a> | switch 语法与 case 穿透、Scanner 标准输入、简单计算器实战 |
| <a href="obsidian://open?file=方法重载与递归">Java-方法重载与递归</a> | Overload 三条件、递归的内存风险（StackOverflowError）、递归 vs 迭代 |
| <a href="obsidian://open?file=数组">Java-数组</a> | 内存连续性原理（O(1) 检索的根本原因）、优缺点分析、ArrayList 扩容本质 |
| <a href="obsidian://open?file=Object类与String基础">Java-Object类与String基础</a> | toString/equals/hashCode/finalize 四大方法、字符串常量池、`==` vs `equals` |
| <a href="obsidian://open?file=常用API与工具类">Java-常用API与工具类</a> | System/Arrays/String/包装类/Date/SimpleDateFormat/BigDecimal/Random/Enum |

---

## 二、面向对象（7 篇）

> 详见 <a href="obsidian://open?file=MOC - Java面向对象">MOC - Java面向对象</a>

> OOP 四大支柱的 Java 实现：封装、继承、多态、抽象。

| 笔记                                                                             | 一句话说明                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| <a href="obsidian://open?file=对象与this关键字">Java-面向对象-对象与this关键字</a>   | 对象在堆/引用在栈、this. 与 this() 的规则、何时不能省略 this               |
| <a href="obsidian://open?file=继承与super关键字">Java-面向对象-继承与super关键字</a> | extends、构造方法调用链、super. 与 super()、静态代码块与构造代码块           |
| <a href="obsidian://open?file=方法覆盖与多态">Java-面向对象-方法覆盖与多态</a>         | Override vs Overload、向上/向下转型、instanceof、编译看左运行看右       |
| <a href="obsidian://open?file=final关键字与常量">Java-面向对象-final关键字与常量</a> | final 修饰类/方法/变量、static final 常量规范、final vs abstract 对立 |
| <a href="obsidian://open?file=抽象类与抽象方法">Java-面向对象-抽象类与抽象方法</a>       | abstract class/method、"面向抽象编程"、OCP 开闭原则                |
| <a href="obsidian://open?file=接口">Java-面向对象-接口</a>                   | interface 完全抽象、多实现多继承、"接口 + 多态 = 解耦合"、餐厅点餐案例           |
| <a href="obsidian://open?file=内部类与匿名内部类">Java-面向对象-内部类与匿名内部类</a>     | 静态/实例/局部/匿名内部类、四大访问权限表、package 与 import 规范             |

---

## 三、异常与集合（5 篇）

> 详见 <a href="obsidian://open?file=MOC - 异常与集合">MOC - 异常与集合</a>

> 程序健壮性与数据结构。

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=异常处理">Java-异常处理</a> | Throwable 体系（Error/Exception/RuntimeException）、编译时 vs 运行时异常、try-catch-finally、finally 面试题（return 100）、自定义异常 |
| <a href="obsidian://open?file=集合框架-Collection与List">Java-集合框架-Collection与List</a> | 集合继承体系、ArrayList(数组/1.5倍扩容) vs LinkedList(双向链表) vs Vector(线程安全/2倍扩容)、迭代器安全删除 |
| <a href="obsidian://open?file=集合框架-Set与排序">Java-集合框架-Set与排序</a> | HashSet 底层是 HashMap、TreeSet 自动排序、Comparable vs Comparator 三种实现方式、中序遍历 |
| <a href="obsidian://open?file=集合框架-Map详解">Java-集合框架-Map详解</a> | HashMap put/get 原理（哈希算法→数组下标→链表equals）、扩容 2 倍、红黑树阈值 8→6、HashTable vs ConcurrentHashMap null 容忍度速查、Properties 属性类 |
| <a href="obsidian://open?file=集合框架-泛型与foreach">Java-集合框架-泛型与foreach</a> | 泛型编译期类型检查、钻石表达式 `<>`、foreach 优缺点、自定义泛型 `<E>` `<T>` |

---

## 四、IO 流（2 篇）

> 详见 <a href="obsidian://open?file=MOC - IO流">MOC - IO流</a>

> Java 与外部数据交互的桥梁。

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=IO流体系">Java-IO流体系</a> | 四大家族（InputStream/OutputStream/Reader/Writer）、16 种流分类、FileInputStream 文件拷贝标准架子、BufferedReader readLine、PrintStream 日志工具 |
| <a href="obsidian://open?file=IO流-序列化与Properties">Java-IO流-序列化与Properties</a> | Serializable 标志性接口、serialVersionUID 手动指定（防止 InvalidClassException）、transient 游离字段、Properties + IO 配置文件模式、File 类常用方法 |

---

## 五、多线程（3 篇）

> 详见 <a href="obsidian://open?file=MOC - 多线程">MOC - 多线程</a>

> 并发的入门、安全与进阶。

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=基础概念与实现">Java-多线程-基础概念与实现</a> | 进程 vs 线程、三种实现（Thread/Runnable/Callable）、生命周期、sleep/interrupt/join/yield、安全终止（布尔标记替代 stop） |
| <a href="obsidian://open?file=同步与锁机制">Java-多线程-同步与锁机制</a> | 线程安全问题三条件、synchronized 三种用法（代码块/实例方法/静态方法）、对象锁 vs 类锁面试题、死锁代码、StringBuilder vs StringBuffer、三级解决策略 |
| <a href="obsidian://open?file=高级特性">Java-多线程-高级特性</a> | 守护线程、Timer 定时器、wait/notify（生产者-消费者完整案例）、异步 vs 同步编程模型 |

---

## 六、高级特性（2 篇）

> 详见 <a href="obsidian://open?file=MOC - 高级特性">MOC - 高级特性</a>

> 框架基石：反射与注解。

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=反射机制">Java-反射机制</a> | Class/Field/Method/Constructor 四大核心类、获取 Class 三种方式、反射调用方法四要素、类加载器双亲委派机制、配置文件 + 反射 = Spring IoC 思想 |
| <a href="obsidian://open?file=注解">Java-注解</a> | @interface 定义、元注解（@Target/@Retention）、RUNTIME 保留策略、反射读取注解属性值、注解在开发中的校验实战 |

---

## 七、开发手册（9 篇）

> 详见 <a href="obsidian://open?file=MOC - 开发手册">MOC - 开发手册</a>

> 来源：阿里巴巴 Java 开发手册（嵩山版 v1.7.0）。每一条背后都有线上血泪史。

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=阿里巴巴Java开发手册-命名与格式规约">阿里巴巴Java开发手册-命名与格式规约</a> | UpperCamelCase/lowerCamelCase/全大写下划线、DO/DTO/VO/BO 命名约定、代码格式（4空格缩进/120字符/Unix换行）、常量定义与枚举推荐 |
| <a href="obsidian://open?file=阿里巴巴Java开发手册-集合处理避坑">阿里巴巴Java开发手册-集合处理避坑</a> | subList 三大陷阱、toArray 正确姿势、Arrays.asList 三坑、foreach 安全遍历、Map null 容忍度速查、BigDecimal 比较用 compareTo |
| <a href="obsidian://open?file=阿里巴巴Java开发手册-并发编程安全规约">阿里巴巴Java开发手册-并发编程安全规约</a> | 禁止 Executors 创建线程池、SimpleDateFormat ThreadLocal 防护、ThreadLocal finally 清理、Lock unlock 铁律、DCL + volatile |
| <a href="obsidian://open?file=阿里巴巴Java开发手册-OOP与格式规约">阿里巴巴Java开发手册-OOP与格式规约</a> | POJO 必须 toString/equals+hashCode、贫血模型、方法参数≤5、代码格式 |
| <a href="obsidian://open?file=阿里巴巴Java开发手册-MySQL数据库规约">阿里巴巴Java开发手册-MySQL数据库规约</a> | 表名小写下划线、varchar<5000、单表>500万分库分表、禁止 SELECT * |
| <a href="obsidian://open?file=阿里巴巴Java开发手册-异常日志与工程规约">阿里巴巴Java开发手册-异常日志与工程规约</a> | 禁止吞异常、SLF4J+占位符、安全规约（SQL注入/XSS）、工程分层 |
| <a href="obsidian://open?file=阿里巴巴Java开发手册-控制语句与注释规约">阿里巴巴Java开发手册-控制语句与注释规约</a> | switch 必有 default、禁止 if 复杂取反、三目不嵌套、Javadoc 完整注释 |
| <a href="obsidian://open?file=阿里巴巴Java开发手册-单元测试规约">阿里巴巴Java开发手册-单元测试规约</a> | AIR 原则、BCDE 边界值、Mockito 隔离外部依赖、增量覆盖率≥80% |
| <a href="obsidian://open?file=阿里巴巴Java开发手册-设计规约">阿里巴巴Java开发手册-设计规约</a> | 单一职责、组合优于继承、Controller→Service→DAO 分层、设计模式应用 |

---

## 八、推荐学习路径

```
第一阶段：Java 基础
  └─ 数据类型 → 运算符 → 控制语句 → 方法 → 数组 → Object/String → 常用API

第二阶段：面向对象
  └─ 对象与this → 继承与super → 方法覆盖与多态 → final与常量 → 抽象类 → 接口 → 内部类

第三阶段：异常 + 集合 + IO
  └─ 异常处理 → Collection/List → Set → Map → 泛型 → IO流体系 → 序列化

第四阶段：多线程 + 高级 + 规范
  └─ 线程基础 → 同步锁 → 高级特性 → 反射 → 注解 → 开发手册避坑
```

---

## 九、跨领域关联

| Java 主题 | 关联领域 | 具体笔记 |
|-----------|----------|----------|
| 死锁（synchronized 嵌套） | 数据库 | <a href="obsidian://open?file=事务恢复与并发控制">数据库系统概论-事务恢复与并发控制</a> — DB 死锁四条件与 Java 死锁完全对应 |
| HashMap 哈希原理 | 数据库 | <a href="obsidian://open?file=索引视图与存储过程">数据库系统概论-索引视图与存储过程</a> — 哈希索引 vs B+Tree 索引类比 |
| equals/hashCode 规约 | 数据库 | <a href="obsidian://open?file=阿里巴巴Java开发手册-MySQL与ORM规约">阿里巴巴Java开发手册-MySQL与ORM规约</a> — 唯一索引 ≈ hashCode 定位 + equals 校验 |
| 事务 ACID | 多线程 | <a href="obsidian://open?file=事务恢复与并发控制">数据库系统概论-事务恢复与并发控制</a> — 隔离性与 Java 线程同步本质相通 |
| 异常处理 try-catch-finally | IO流 | <a href="obsidian://open?file=IO流体系">Java-IO流体系</a> — 流关闭必须在 finally 中确保 |

---

## 十、标签统计

| 标签 | 使用次数 | 覆盖笔记 |
|------|----------|----------|
| `Java/基础` | 7 | 数据类型、运算符、控制语句、方法、数组、Object/String、常用API |
| `Java/OOP` | 7 | 对象与this、继承与super、多态、final、抽象类、接口、内部类 |
| `Java/集合` | 4 | Collection/List、Set、Map、泛型 |
| `Java/IO` | 2 | IO流体系、序列化与Properties |
| `Java/多线程` | 3 | 基础、同步锁、高级特性 |
| `Java/高级` | 2 | 反射、注解 |
| `Java/规范` | 3 | 命名格式、集合避坑、并发安全 |

> 📂 所属：[[MOC - 后端]]
