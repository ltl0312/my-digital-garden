---
aliases: [线程池规约, SimpleDateFormat线程安全, ThreadLocal清理, Lock释放, 并发避坑]
tags:
  - status/待处理
  - type/笔记
  - Java/规范
  - Java/多线程
created: "2026-06-16 11:00"
updated: "2026-06-16 15:00"
知识体系: "Java 后端 → L2 核心工具"
技术版本: "Java 17 / 阿里巴巴嵩山版 v1.7.0"
source: "阿里巴巴Java开发手册-嵩山版（已归档）"
---

# 阿里巴巴 Java 开发手册 — 并发编程安全规约

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L2 核心工具
- **上游依赖**：📋 待补充：Java多线程基础知识、📋 待补充：JVM内存模型 — 理解线程安全需先掌握多线程基础与 JMM
- **下游延伸**：📋 待补充：JUC高阶并发工具、📋 待补充：分布式锁 — 在掌握线程池/锁规约后可深入 JUC 源码与分布式协调
- **同级技术**：📋 待补充：Go协程与通道、📋 待补充：Node.js事件循环 — 同为解决并发问题的技术方案但范式不同

## 核心概念
> 并发问题是 Java 线上事故的重灾区。阿里巴巴手册给出的核心逻辑是：线程池必须显式创建（避免 OOM）、SimpleDateFormat 不可作为 static 变量、ThreadLocal 必须 finally 清理、锁的 unlock 必须在 finally 中。

---

## 一、线程池创建铁律

### ⚠️ 严禁使用 Executors 创建线程池！
```java
// ❌ Executors.newFixedThreadPool()
// ❌ Executors.newSingleThreadExecutor()
// ❌ Executors.newCachedThreadPool()
// 原因：内部队列 Integer.MAX_VALUE → OOM 风险！

// ✅ 必须用 ThreadPoolExecutor 显式指定参数
new ThreadPoolExecutor(
    corePoolSize,
    maximumPoolSize,
    keepAliveTime, TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(capacity),  // 必须指定有界队列容量！
    new ThreadFactory() { /* 自定义线程命名 */ },
    new ThreadPoolExecutor.CallerRunsPolicy()
);
```

### 线程必须命名
```java
public class UserThreadFactory implements ThreadFactory {
    private final String namePrefix;
    private final AtomicInteger nextId = new AtomicInteger(1);

    UserThreadFactory(String featureName) {
        namePrefix = "From-UserThreadFactory-" + featureName + "-Worker-";
    }
    @Override
    public Thread newThread(Runnable task) {
        String name = namePrefix + nextId.getAndIncrement();
        // name 会出现在 jstack 中，方便排查！
        return new Thread(null, task, name, 0, false);
    }
}
```

---

## 二、SimpleDateFormat 线程安全灾难

### 问题
`SimpleDateFormat` 是**线程不安全**的！多个线程共用一个 static 实例 → 数据错乱。

### ✅ 正确方案

```java
// 方案一：ThreadLocal（JDK8 前推荐）
private static final ThreadLocal<DateFormat> df = new ThreadLocal<DateFormat>() {
    @Override
    protected DateFormat initialValue() {
        return new SimpleDateFormat("yyyy-MM-dd");
    }
};

// 方案二：JDK8 DateTimeFormatter（不可变 + 线程安全，推荐！）
DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
```

> `DateTimeFormatter` 是 immutable 和 thread-safe 的，完全替代 SimpleDateFormat。

---

## 三、ThreadLocal 必须 finally 清理（内存泄漏风险）

```java
// ❌ 忘记 remove → 线程池复用场景下 → 内存泄漏 + 数据错乱
objectThreadLocal.set(userInfo);
// ... 业务逻辑

// ✅ 正确做法
objectThreadLocal.set(userInfo);
try {
    // 业务逻辑
} finally {
    objectThreadLocal.remove();  // 必须清理！
}
```

---

## 四、Lock 的 try-finally 铁律

```java
Lock lock = new ReentrantLock();

// ① lock() 必须写在 try 外部！
lock.lock();
try {
    doSomething();
    doOthers();
} finally {
    lock.unlock();  // ② unlock 必须在 finally 第一行！
}

// ③ tryLock 也要判断是否获取成功
if (lock.tryLock()) {
    try {
        doSomething();
    } finally {
        lock.unlock();
    }
}
```

> **为什么 lock() 要在 try 外部？** 如果在 try 内部，当 lock() 抛异常时，finally 中的 unlock 会抛出 IllegalMonitorStateException（AQS 的 tryRelease 校验），掩盖了原始异常。

---

## 五、Double-Checked Locking 的正确写法

```java
public class LazyInitDemo {
    // ⚠️ 必须加 volatile！否则可能拿到半初始化对象
    private volatile Helper helper = null;

    public Helper getHelper() {
        if (helper == null) {           // 第一重检查
            synchronized (this) {
                if (helper == null) {   // 第二重检查
                    helper = new Helper();
                }
            }
        }
        return helper;
    }
}
```

> JDK5 之前 DCL 是 Broken 的（指令重排可能导致半初始化对象逸出），**volatile** 在 JDK5+ 中通过内存屏障修复了此问题。

---

## 六、volatile 与原子性

```java
// ❌ volatile 不保证原子性！
volatile int count = 0;
count++;  // 不是原子操作（读→改→写），多线程仍会出错

// ✅ 用 Atomic 类
AtomicInteger count = new AtomicInteger();
count.addAndGet(1);

// JDK8 LongAdder 在高并发下比 AtomicLong 性能更好
LongAdder adder = new LongAdder();
adder.increment();
```

---

## 七、其他关键并发规约速查

| 规约 | 说明 |
|------|------|
| 禁止 Timer | 用 `ScheduledExecutorService` 替代 |
| CountDownLatch 的 countDown 必须在 try-catch 中 | 否则异常导致 await 永远不返回 |
| Random 实例避免多线程共享 | JDK7+ 用 `ThreadLocalRandom` 替代 |
| HashMap 在 resize 时可能导致 CPU 100% | 多线程用 `ConcurrentHashMap` |
| ThreadLocal 对象建议 `static` | 避免每个线程实例重复创建 |
| `volatile` 解决多线程内存可见性问题 | 但不解决原子性问题 |

---

## 关联上下文
- **前置知识**：📋 待补充：Java多线程基础知识 — 理解线程生命周期与 synchronized 的基本用法是阅读本规约的前提
- **横向对比**：📋 待补充：synchronized与Lock对比 — 本规约侧重 Lock 规范，实际选型需按场景权衡性能和便利性
- **实际应用**：📋 待补充：高并发Web服务线程池配置实战术 — 线程池规约在 Tomcat/Netty 等中间件中的落地配置
- **进阶方向**：📋 待补充：JUC源码导读 — 理解 ThreadPoolExecutor、ReentrantLock 的 AQS 实现原理
- **易混淆概念**：📋 待补充：volatile与原子类区别 — volatile 只保证可见性不保证原子性，AtomicInteger 通过 CAS 保证原子性，二者各有适用场景
- **完整手册母体**：本笔记源自 阿里巴巴Java开发手册-嵩山版（已归档）
- **Java 多线程基础**：Thread/Runnable/Callable 等前置知识，详见 <a href="obsidian://open?file=基础概念与实现">Java-多线程-基础概念与实现</a>
- **synchronized 与锁机制**：对象锁/类锁/死锁等，详见 <a href="obsidian://open?file=同步与锁机制">Java-多线程-同步与锁机制</a>
> 📂 所属：[[MOC - 开发手册]]