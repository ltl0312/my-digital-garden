---
aliases: [MOC - 操作系统, 操作系统知识地图]
tags:
  - status/进行中
  - type/MOC
created: "2026-06-29 11:30"
updated: "2026-06-29 11:30"
source: "https://blog.csdn.net/realoser/article/details/149962525"
知识体系: "跨学科纵深 → XD-2 操作系统"
技术版本: "跨学科基础概念，不受版本约束"
---

# MOC - 操作系统

> 本文档是操作系统知识领域的中心地图（Map of Content），覆盖王道 408 考研操作系统五大模块的核心知识。所有原子笔记通过底部 📂 所属链接汇聚于此。

---

## 目录结构树

```
操作系统/
├── MOC - 操作系统.md                    ← 本文件
├── 操作系统概述/
│   ├── 操作系统概念、功能与特征.md
│   ├── 操作系统概述-环境配置与项目初始化.md
│   ├── 操作系统运行机制-中断与系统调用.md
│   └── 操作系统体系结构与引导.md
├── 进程管理/
│   ├── 进程的概念、组成与状态.md
│   ├── 进程通信.md
│   ├── 线程与多线程模型.md
│   ├── 处理机调度与调度算法.md
│   ├── 进程同步与互斥.md
│   ├── 信号量机制与经典同步问题.md
│   ├── 管程与死锁.md
│   └── 进程管理-实验环境与代码示例.md
├── 内存管理/
│   ├── 内存管理基础.md
│   └── 非连续分配与虚拟内存.md
├── 文件管理/
│   └── 文件系统.md
└── 设备管理/
    └── IO系统.md
```

---

## 分板块笔记列表

### 一、操作系统概述（4 篇）

| 笔记 | 简介 |
|------|------|
| <a href="obsidian://open?file=操作系统概念、功能与特征">操作系统概念、功能与特征</a> | OS 的定义、五大管理功能、四大特征（并发/共享/虚拟/异步）及其内在关系 |
| <a href="obsidian://open?file=环境配置与项目初始化">环境配置与项目初始化</a> | Linux 虚拟机安装、fork 系统调用验证、开发工具链配置 |
| <a href="obsidian://open?file=操作系统运行机制-中断与系统调用">操作系统运行机制-中断与系统调用</a> | 内核态/用户态切换、中断分类（内/外）、系统调用完整过程、库函数 vs 系统调用 |
| <a href="obsidian://open?file=操作系统体系结构与引导">操作系统体系结构与引导</a> | 六种体系结构（大内核/微内核/分层/模块化/外核）对比、Boot 引导流程、虚拟机 VMM 分类 |

### 二、进程管理（8 篇）

| 笔记 | 简介 |
|------|------|
| <a href="obsidian://open?file=进程的概念、组成与状态">进程的概念、组成与状态</a> | 进程实体（PCB+程序段+数据段）、五种状态及转换、五种进程控制原语 |
| <a href="obsidian://open?file=进程通信">进程通信</a> | 三种 IPC 方式对比：共享存储（shm_open/mmap）、消息传递（send/receive）、管道通信（pipe） |
| <a href="obsidian://open?file=线程与多线程模型">线程与多线程模型</a> | ULT vs KLT 对比、三种多线程模型（一对一/多对一/多对多）、TCB 组成 |
| <a href="obsidian://open?file=处理机调度与调度算法">处理机调度与调度算法</a> | 三级调度层次、六种调度算法（FCFS/SJF/HRRN/RR/优先级/多级反馈队列）+ 评价指标 |
| <a href="obsidian://open?file=进程同步与互斥">进程同步与互斥</a> | 临界区四部分、互斥四原则、四种软件实现算法演变（单标志→双标志→Peterson）、TSL/Swap/自旋锁 |
| <a href="obsidian://open?file=信号量机制与经典同步问题">信号量机制与经典同步问题</a> | 整形→记录型信号量演变、PV 操作实现互斥/同步/前驱、三大经典问题（生产者消费者/读者写者/哲学家） |
| <a href="obsidian://open?file=管程与死锁">管程与死锁</a> | 管程三特征与生产者消费者实现；死锁四条件、银行家算法安全性检测、死锁检测与解除方法 |
| <a href="obsidian://open?file=实验环境与代码示例">进程管理-实验环境与代码示例</a> | fork 进程创建、POSIX 信号量生产者消费者实验代码 |

### 三、内存管理（2 篇）

| 笔记 | 简介 |
|------|------|
| <a href="obsidian://open?file=内存管理基础">内存管理基础</a> | 三种装入方式（绝对/静态重定位/动态重定位）、三种链接方式、覆盖/交换技术、连续分配（单一/固定/动态分区）四大算法 |
| <a href="obsidian://open?file=非连续分配与虚拟内存">非连续分配与虚拟内存</a> | 分页（页表/TLB/两级页表）、分段、段页式；虚拟内存（缺页中断）、五种页面置换算法、三种分配策略、抖动 |

### 四、文件管理（1 篇）

| 笔记 | 简介 |
|------|------|
| <a href="obsidian://open?file=文件系统">文件系统</a> | 文件逻辑结构（顺序/索引/索引顺序）、FCB/索引结点、三种物理分配（连续/链接/索引）、存储空间管理（位示图等）、硬链接 vs 软链接、VFS |

### 五、设备管理（1 篇）

| 笔记 | 简介 |
|------|------|
| <a href="obsidian://open?file=IO系统">IO 系统</a> | IO 控制器功能、四种控制方式演进（程序→中断→DMA→通道）、IO 软件层次、SPOOLing 技术、五种缓冲区策略、六种磁盘调度算法、SSD vs HDD |

---

## 推荐学习路径

### 阶段一：OS 基础认知（1-2 天）
1. 先阅读 <a href="obsidian://open?file=操作系统概念、功能与特征">操作系统概念、功能与特征</a> → 建立 OS 在计算机系统中的定位
2. 然后 <a href="obsidian://open?file=操作系统运行机制-中断与系统调用">操作系统运行机制-中断与系统调用</a> → 理解 OS 如何获得 CPU 控制权
3. 再读 <a href="obsidian://open?file=操作系统体系结构与引导">操作系统体系结构与引导</a> → 理解 OS 自身如何被构建

### 阶段二：进程管理核心（3-4 天）
4. <a href="obsidian://open?file=进程的概念、组成与状态">进程的概念、组成与状态</a> → <a href="obsidian://open?file=线程与多线程模型">线程与多线程模型</a> → 掌握进程/线程区别
5. <a href="obsidian://open?file=处理机调度与调度算法">处理机调度与调度算法</a> → 掌握 CPU 分配策略
6. <a href="obsidian://open?file=进程通信">进程通信</a> → 了解进程间如何交换数据
7. <a href="obsidian://open?file=进程同步与互斥">进程同步与互斥</a> → <a href="obsidian://open?file=信号量机制与经典同步问题">信号量机制与经典同步问题</a> → <a href="obsidian://open?file=管程与死锁">管程与死锁</a> → 掌握并发编程的理论基础

### 阶段三：内存管理（2-3 天）
8. <a href="obsidian://open?file=内存管理基础">内存管理基础</a> → 理解连续分配的演进
9. <a href="obsidian://open?file=非连续分配与虚拟内存">非连续分配与虚拟内存</a> → 掌握分页/分段/虚拟内存核心机制

### 阶段四：文件与 IO（2 天）
10. <a href="obsidian://open?file=文件系统">文件系统</a> → 理解文件如何存储在磁盘
11. <a href="obsidian://open?file=IO系统">IO 系统</a> → 理解 CPU 如何与外部设备交互

---

## 跨领域关联表

| 本领域笔记 | 关联目标 | 关联性质 |
|-----------|----------|----------|
| <a href="obsidian://open?file=操作系统概念、功能与特征">操作系统概念</a> | <a href="obsidian://open?file=系统概述">计组-系统概述</a> | 上游依赖：冯·诺依曼架构 |
| <a href="obsidian://open?file=操作系统运行机制-中断与系统调用">中断与系统调用</a> | <a href="obsidian://open?file=CPU">计组-CPU</a> | 上游依赖：PSW/特权指令 |
| <a href="obsidian://open?file=信号量机制与经典同步问题">信号量机制</a> | <a href="obsidian://open?file=同步与锁机制">Java 多线程同步</a> | 下游应用：JVM Semaphore |
| <a href="obsidian://open?file=管程与死锁">管程与死锁</a> | <a href="obsidian://open?file=同步与锁机制">Java 多线程同步</a> | 下游应用：synchronized = 管程 |
| <a href="obsidian://open?file=非连续分配与虚拟内存">虚拟内存</a> | <a href="obsidian://open?file=MySQL-InnoDB索引与MVCC详解">MySQL InnoDB</a> | 下游应用：InnoDB 缓冲池 LRU |
| <a href="obsidian://open?file=非连续分配与虚拟内存">页面置换LRU</a> | <a href="obsidian://open?file=Redis-高性能原理与数据结构">Redis 高性能</a> | 下游应用：Redis 键淘汰 LRU |
| <a href="obsidian://open?file=IO系统">IO 系统-DMA</a> | <a href="obsidian://open?file=总线与IO系统">计组-总线与IO</a> | 上游依赖：DMA 控制器硬件 |
| <a href="obsidian://open?file=操作系统体系结构与引导">虚拟机</a> | <a href="obsidian://open?file=Compose全栈部署与网络拓扑">Docker-Compose</a> | 下游应用：容器化技术 |
| <a href="obsidian://open?file=处理机调度与调度算法">调度算法</a> | <a href="obsidian://open?file=IO系统">IO 系统-磁盘调度</a> | 横向对比：同名算法不同域 |

### 跨学科溯源（XD 纵深）

| 操作系统概念 | 溯源路径 |
|-------------|----------|
| 并发性 | → <a href="obsidian://open?file=XD-1 数字系统与体系结构">XD-1</a>（多核/超线程） → <a href="obsidian://open?file=XD-0 物理与电路">XD-0</a>（晶体管开关） |
| 虚拟内存/分页 | → <a href="obsidian://open?file=XD-1 数字系统与体系结构">XD-1</a>（MMU/TLB 硬件） → <a href="obsidian://open?file=XD-0 物理与电路">XD-0</a>（地址译码） |
| LRU 算法 | → <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5</a>（双向链表+HashMap = LinkedHashMap） |
| 文件系统 | → <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6</a>（VFS 策略模式 → 面向接口编程） |
| SSD 闪存 | → <a href="obsidian://open?file=XD-0 物理与电路">XD-0</a>（浮栅晶体管物理原理） |

---

## 标签使用统计

| 标签 | 出现次数 |
|------|----------|
| `status/进行中` | 16 |
| `type/笔记` | 14 |
| `type/教程` | 2 |
| `type/MOC` | 1 |

> 📂 所属：[[MOC - 计算机基础]]
