---
aliases: [阿里巴巴Java开发手册, Alibaba Java Coding Guidelines]
tags: [status/待处理, type/素材]
author: "阿里巴巴集团"
publication_year: "2017 (1.4.0 PDF)"
created: "2026-06-16 20:07"
updated: "2026-06-16 20:07"
source: "[[2020-06-24-阿里巴巴Java开发手册（详尽版）.pdf]]"
---

# 阿里巴巴Java开发手册

## 摘要与核心论点
> 阿里巴巴出品的 Java 开发规范文档，涵盖编程规约（命名、常量、OOP、集合、并发、控制语句、注释）、异常日志、单元测试、安全规约、MySQL 数据库、工程结构、设计规约七大板块。目标是"码出高效，码出质量"——通过代码规范减少线上事故。

## 关键提取
- **命名规范**：UpperCamelCase 用于类名，lowerCamelCase 用于方法/变量名；常量全大写+下划线；BO/VO/DO/DTO 分层命名约定
- **集合处理**：禁止在 foreach 循环中 remove/add 元素（ConcurrentModificationException），用 Iterator；ArrayList 初始化时指定容量；entrySet 遍历 Map 优于 keySet
- **并发编程**：线程池必须手动创建（ThreadPoolExecutor）而非用 Executors；SimpleDateFormat 线程不安全需用 ThreadLocal 包装；锁粒度要尽量小
- **OOP 规约**：POJO 类必须覆写 toString()；Object.equals() 必须同时覆写 hashCode()；禁止在 POJO 中写业务逻辑
- **MySQL 规约**：表名/字段名必须小写+下划线；varchar 长度不超过 5000；单表行数超过 500 万或容量超过 2GB 推荐分库分表

## 灵感与应用
- **启发**：好的代码规范不仅减少 Bug，更降低团队协作的沟通成本
- **行动**：在 Spring Boot 项目中将本手册的核心规则集成到 ESLint/SonarQube 静态检查中

## 目录结构概览
1. 编程规约（命名、常量、格式、OOP、集合、并发、控制语句、注释）
2. 异常日志
3. 单元测试
4. 安全规约
5. MySQL 数据库规约
6. 工程结构
7. 设计规约
