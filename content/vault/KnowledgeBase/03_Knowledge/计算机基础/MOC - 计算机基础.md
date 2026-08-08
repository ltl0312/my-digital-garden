---
aliases: [计算机基础 MOC, CS Fundamentals, 计算机组成原理 MOC]
tags: [status/进行中, type/MOC, 计算机基础]
created: "2026-06-16 19:47"
updated: "2026-06-29 11:35"
知识体系: "跨学科纵深"
---

# MOC - 计算机基础

> 本 MOC 覆盖操作系统（XD-2）、计算机组成原理（XD-1）、数据通信（XD-3）、编译原理（XD-4）及跨学科纵深存根（XD-0~XD-8）。下设子领域：<a href="obsidian://open?file=MOC - 操作系统">MOC - 操作系统</a> / <a href="obsidian://open?file=MOC - 编译原理">MOC - 编译原理</a> / <a href="obsidian://open?file=MOC - 数据通信">MOC - 数据通信</a> / <a href="obsidian://open?file=MOC - 计算机组成原理">MOC - 计算机组成原理</a> / <a href="obsidian://open?file=MOC - 数据科学">MOC - 数据科学</a> / <a href="obsidian://open?file=MOC - 跨学科纵深">MOC - 跨学科纵深</a>。共 49 篇笔记。

---

## 一、目录结构树

```
03_Knowledge/计算机基础/
├── MOC - 计算机基础.md
├── 计算机组成原理-系统概述.md
├── 计算机组成原理-运算方法与运算器.md
├── 计算机组成原理-存储系统.md
├── 计算机组成原理-指令系统.md
├── 计算机组成原理-CPU.md
├── 计算机组成原理-总线与IO系统.md
├── 计算机组成原理-学习环境与工具.md
├── 操作系统/
│   ├── MOC - 操作系统.md
│   ├── 操作系统概述/
│   │   ├── 操作系统概念、功能与特征.md
│   │   ├── 操作系统概述-环境配置与项目初始化.md
│   │   ├── 操作系统运行机制-中断与系统调用.md
│   │   └── 操作系统体系结构与引导.md
│   ├── 进程管理/
│   │   ├── 进程的概念、组成与状态.md
│   │   ├── 进程通信.md
│   │   ├── 线程与多线程模型.md
│   │   ├── 处理机调度与调度算法.md
│   │   ├── 进程同步与互斥.md
│   │   ├── 信号量机制与经典同步问题.md
│   │   ├── 管程与死锁.md
│   │   └── 进程管理-实验环境与代码示例.md
│   ├── 内存管理/
│   │   ├── 内存管理基础.md
│   │   └── 非连续分配与虚拟内存.md
│   ├── 文件管理/
│   │   └── 文件系统.md
│   └── 设备管理/
│       └── IO系统.md
├── 数据通信/
│   ├── 数据通信-通信系统基础与信道.md
│   ├── 数据通信-模拟信号数字化.md
│   ├── 数据通信-多路复用与交换技术.md
│   ├── 数据通信-数字基带与频带传输.md
│   ├── 数据通信-同步与差错控制.md
│   └── 数据通信-学习工具与环境.md
└── 编译原理/
    ├── 编译原理-编译器概述与文法.md
    ├── 编译原理-词法分析.md
    ├── 编译原理-语法分析-自上而下(LL).md
    ├── 编译原理-语法分析-自下而上(LR).md
    ├── 编译原理-语法制导翻译与中间代码.md
    ├── 编译原理-运行时存储组织.md
    ├── 编译原理-代码优化与目标代码生成.md
    └── 编译原理-学习工具与环境.md
```

---

## 二、分板块笔记列表

| 笔记                   | 一句话简介                                      |
| -------------------- | ------------------------------------------ |
| <a href="obsidian://open?file=系统概述">计算机组成原理-系统概述</a>     | 七层抽象结构、体系结构 vs 组成、字长/主频/MIPS/MTBF 等性能指标    |
| <a href="obsidian://open?file=运算方法与运算器">计算机组成原理-运算方法与运算器</a> | 原码/反码/补码/移码、IEEE 754 浮点数、ALU 硬件设计          |
| <a href="obsidian://open?file=存储系统">计算机组成原理-存储系统</a>     | 存储器金字塔、Cache（直接/组相联/全相联）、虚拟内存/TLB、局部性原理    |
| <a href="obsidian://open?file=指令系统">计算机组成原理-指令系统</a>     | 指令格式、寻址方式（立即/直接/寄存器/间接/基址/变址）、CISC vs RISC |
| <a href="obsidian://open?file=CPU">计算机组成原理-CPU</a>      | 数据通路+控制器、五级流水线、三大冒险（结构/数据/控制）、硬布线 vs 微程序   |
| <a href="obsidian://open?file=总线与IO系统">计算机组成原理-总线与IO系统</a>  | 总线仲裁（链式/计数/独立请求）、中断处理流程、DMA 直接存储器访问        |
| <a href="obsidian://open?file=学习环境与工具">计算机组成原理-学习环境与工具</a>  | Logisim 电路仿真、Ripes 流水线可视化、Godbolt 编译器探索    |

### XD-2 — 操作系统

| 笔记 | 一句话简介 |
|------|-----------|
| <a href="obsidian://open?file=操作系统概念、功能与特征">操作系统概念、功能与特征</a> | OS 定义、五大管理功能、四大特征（并发/共享/虚拟/异步）及内在关系 |
| <a href="obsidian://open?file=操作系统运行机制-中断与系统调用">操作系统运行机制-中断与系统调用</a> | 内核态/用户态切换、中断分类、系统调用完整过程 |
| <a href="obsidian://open?file=操作系统体系结构与引导">操作系统体系结构与引导</a> | 五种内核架构对比、Boot 引导流程、虚拟机 VMM 分类 |
| <a href="obsidian://open?file=进程的概念、组成与状态">进程的概念、组成与状态</a> | PCB+程序段+数据段、五状态转换、五种控制原语 |
| <a href="obsidian://open?file=进程通信">进程通信</a> | 共享存储/消息传递/管道通信三种 IPC 方式对比 |
| <a href="obsidian://open?file=线程与多线程模型">线程与多线程模型</a> | ULT vs KLT、三种多线程模型（一对一/多对一/多对多） |
| <a href="obsidian://open?file=处理机调度与调度算法">处理机调度与调度算法</a> | 三级调度、六种算法（FCFS/SJF/HRRN/RR/优先级/多级反馈队列） |
| <a href="obsidian://open?file=进程同步与互斥">进程同步与互斥</a> | 临界区四原则、四种软件算法（单标志→Peterson）、TSL/自旋锁 |
| <a href="obsidian://open?file=信号量机制与经典同步问题">信号量机制与经典同步问题</a> | 记录型信号量 PV 操作、生产者消费者/读者写者/哲学家三大经典问题 |
| <a href="obsidian://open?file=管程与死锁">管程与死锁</a> | 管程定义与特征；死锁四条件、银行家算法、检测与解除 |
| <a href="obsidian://open?file=内存管理基础">内存管理基础</a> | 三种装入/链接方式、覆盖/交换、连续分配四种算法 |
| <a href="obsidian://open?file=非连续分配与虚拟内存">非连续分配与虚拟内存</a> | 分页（页表/TLB/两级页表）、分段、段页式、虚拟内存五种页面置换算法 |
| <a href="obsidian://open?file=文件系统">文件系统</a> | 逻辑/物理结构、文件目录、存储空间管理、硬链接vs软链接、VFS |
| <a href="obsidian://open?file=IO系统">IO 系统</a> | 四种 IO 控制方式演进、SPOOLing、缓冲区管理、六种磁盘调度算法 |

> 📋 详细索引见 <a href="obsidian://open?file=MOC - 操作系统">MOC - 操作系统</a>。

| 笔记 | 一句话简介 |
|------|-----------|
| <a href="obsidian://open?file=通信系统基础与信道">数据通信-通信系统基础与信道</a> | 通信五要素模型、奈奎斯特定理、香农公式、码元速率/信息速率、单工/半双工/全双工 |
| <a href="obsidian://open?file=模拟信号数字化">数据通信-模拟信号数字化</a> | 抽样定理($f_s \ge 2f_m$)、均匀/非均匀量化、PCM 三步骤、DPCM 差值编码 |
| <a href="obsidian://open?file=多路复用与交换技术">数据通信-多路复用与交换技术</a> | FDM/TDM/CDM、电路/报文/分组交换、OSI 七层模型 |
| <a href="obsidian://open?file=数字基带与频带传输">数据通信-数字基带与频带传输</a> | AMI/HDB3/曼彻斯特线路码型、2ASK/2FSK/2PSK/2DPSK 调制、倒π相位模糊 |
| <a href="obsidian://open?file=同步与差错控制">数据通信-同步与差错控制</a> | 载波/位/帧三层同步、FEC vs ARQ、奇偶校验/汉明码/循环码 CRC |
| <a href="obsidian://open?file=学习工具与环境">数据通信-学习工具与环境</a> | GNU Radio 通信仿真、Wireshark 协议分析、眼图绘制 |

### XD-4 — 编译原理

| 笔记 | 一句话简介 |
|------|-----------|
| <a href="obsidian://open?file=编译器概述与文法">编译原理-编译器概述与文法</a> | 编译 vs 解释、三段式架构、Chomsky 四类文法、CFG、推导与二义性 |
| <a href="obsidian://open?file=词法分析">编译原理-词法分析</a> | Token 识别、RE→NFA(Thompson)→DFA(子集构造法)→最小化(Hopcroft) |
| <a href="obsidian://open?file=语法分析-自上而下(LL)">编译原理-语法分析-自上而下(LL)</a> | LL(1)预测分析、FIRST/FOLLOW 集、消除左递归、预测分析表 |
| <a href="obsidian://open?file=语法分析-自下而上(LR)">编译原理-语法分析-自下而上(LR)</a> | 移进-归约、LR(0)/SLR/LR(1)/LALR(1)体系、Yacc/Bison |
| <a href="obsidian://open?file=语法制导翻译与中间代码">编译原理-语法制导翻译与中间代码</a> | S/L-属性文法、三地址码、回填技术、LLVM IR |
| <a href="obsidian://open?file=运行时存储组织">编译原理-运行时存储组织</a> | 静态/栈/堆分配、活动记录、静态链(闭包基础)、动态链 |
| <a href="obsidian://open?file=代码优化与目标代码生成">编译原理-代码优化与目标代码生成</a> | 常量折叠/公共子表达式/循环优化、图着色寄存器分配、指令调度 |
| <a href="obsidian://open?file=学习工具与环境">编译原理-学习工具与环境</a> | ANTLR/Flex+Bison/Godbolt/LLVM |

---

## 三、推荐学习路径

1. <a href="obsidian://open?file=系统概述">计算机组成原理-系统概述</a> — 建立全局视角，理解分层抽象
2. <a href="obsidian://open?file=运算方法与运算器">计算机组成原理-运算方法与运算器</a> — 数据如何在计算机中表示和运算
3. <a href="obsidian://open?file=存储系统">计算机组成原理-存储系统</a> — 数据存在哪、怎么找（Cache/TLB/虚拟内存）
4. <a href="obsidian://open?file=指令系统">计算机组成原理-指令系统</a> — CPU 的"语言"：指令格式和寻址方式
5. <a href="obsidian://open?file=CPU">计算机组成原理-CPU</a> — 指令如何被执行（数据通路+流水线，核心难点）
6. <a href="obsidian://open?file=总线与IO系统">计算机组成原理-总线与IO系统</a> — CPU 如何与外部世界通信

> 配合 <a href="obsidian://open?file=学习环境与工具">计算机组成原理-学习环境与工具</a> 中的 Logisim 和 Ripes 动手实践。

### 操作系统学习路径

1. <a href="obsidian://open?file=操作系统概念、功能与特征">操作系统概念、功能与特征</a> → <a href="obsidian://open?file=操作系统运行机制-中断与系统调用">中断与系统调用</a> → 建立基本认知（1-2 天）
2. <a href="obsidian://open?file=进程的概念、组成与状态">进程基础</a> → <a href="obsidian://open?file=线程与多线程模型">线程模型</a> → <a href="obsidian://open?file=处理机调度与调度算法">调度算法</a>（2 天）
3. <a href="obsidian://open?file=进程同步与互斥">同步互斥</a> → <a href="obsidian://open?file=信号量机制与经典同步问题">信号量</a> → <a href="obsidian://open?file=管程与死锁">管程与死锁</a>（2 天）
4. <a href="obsidian://open?file=内存管理基础">内存基础</a> → <a href="obsidian://open?file=非连续分配与虚拟内存">虚拟内存</a>（2 天）
5. <a href="obsidian://open?file=文件系统">文件系统</a> → <a href="obsidian://open?file=IO系统">IO 系统</a>（1-2 天）

> 配合 <a href="obsidian://open?file=实验环境与代码示例">进程管理实验环境</a> 中的 fork/信号量代码在 Linux 虚拟机中动手验证。

### 数据通信学习路径

1. <a href="obsidian://open?file=通信系统基础与信道">数据通信-通信系统基础与信道</a> — 理解通信模型和香农公式
2. <a href="obsidian://open?file=模拟信号数字化">数据通信-模拟信号数字化</a> — 从连续信号到离散比特的 A/D 转换
3. <a href="obsidian://open?file=多路复用与交换技术">数据通信-多路复用与交换技术</a> — 多用户共享信道 + 互联网的分组交换基础
4. <a href="obsidian://open?file=数字基带与频带传输">数据通信-数字基带与频带传输</a> — 比特如何在物理线路上传输（编码 + 调制）
5. <a href="obsidian://open?file=同步与差错控制">数据通信-同步与差错控制</a> — 收发同步 + 错误检测纠正

---

## 四、跨领域关联表

| 本领域概念 | 跨学科关联 | 关联说明 |
|-----------|-----------|---------|
| 七层抽象模型 | <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a> | 分层架构设计原则 |
| 补码 | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> | 模运算：n 位补码等价于 mod 2^n |
| Cache 局部性 | MySQL B+Tree 索引（📋 待补充） | 数据库页（16KB）匹配磁盘块，利用空间局部性 |
| Cache 替换算法 LRU | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> | 缓存淘汰策略 |
| 虚拟内存/TLB/缺页 | <a href="obsidian://open?file=XD-2 操作系统">XD-2 操作系统</a> | OS 内存管理的硬件基础 |
| 指令集 ISA | <a href="obsidian://open?file=XD-4 编程语言与编译">XD-4 编程语言与编译</a> | 编译器后端将 AST 翻译为指定 ISA 的指令序列 |
| 流水线三大冒险 | <a href="obsidian://open?file=XD-2 操作系统">XD-2 操作系统</a> | 多线程并发中的数据依赖与同步问题 |
| 中断机制 | <a href="obsidian://open?file=XD-2 操作系统">XD-2 操作系统</a> | 进程调度、系统调用依赖中断 |
| DMA | <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a> | 代理模式——DMA 控制器代理 CPU 完成传输 |
| 总线仲裁 | <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> | 共享资源访问顺序的共识机制 |

---

## 五、标签使用统计

| 标签 | 频次 |
|------|------|
| `计算机基础/组成原理` | 7 |
| `计算机基础/操作系统` | 16 |
| `计算机基础/数据通信` | 6 |
| `计算机基础/编译原理` | 8 |
| `type/笔记` | 32 |
| `type/教程` | 5 |
| `type/MOC` | 2 |
| `status/进行中` | 38 |

> **建议**：操作系统（XD-2）已覆盖。建议后续补充：计算机网络（XD-3）、数据结构与算法（XD-5）等核心课程笔记。

> 📂 所属：[[MOC - 知识库总览]]
