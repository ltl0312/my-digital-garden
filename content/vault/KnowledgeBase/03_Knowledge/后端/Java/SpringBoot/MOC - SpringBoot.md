---
aliases: [SpringBoot MOC, SpringBoot知识地图]
tags:
  - status/进行中
  - type/MOC
  - Java/SpringBoot
created: "2026-06-16 13:00"
updated: "2026-06-16 17:40"
知识体系: "Java 后端 → L3 框架层"
---

# MOC - SpringBoot 全栈实战

> 本 MOC 覆盖 Spring Boot 3 自动装配原理、MyBatis-Plus 工程化实践、JWT + RBAC 安全架构、生产避坑以及桌面应用打包部署。从框架机制到 exe 交付，共 10 篇笔记。
>
> 本 MOC 作为应用技术栈的 L1 根节点，聚合以下子领域：

- <a href="obsidian://open?file=MOC - 前端">MOC - 前端</a>
- <a href="obsidian://open?file=MOC - 后端">MOC - 后端</a>
- <a href="obsidian://open?file=MOC - 数据库系统">MOC - 数据库系统</a>

---

## 目录结构

```
03_Knowledge/后端/Java/SpringBoot/
├── MOC - SpringBoot.md                        ← 本文件
├── SpringBoot3-自动装配原理与MVC生命周期.md     ← 框架机制
├── MyBatis-Plus工程化实践.md                   ← 持久层
├── JWT无状态鉴权与安全机制.md                  ← 安全架构
├── RBAC权限模型与五表设计.md                   ← 安全架构
├── SpringBoot-生产环境避坑实录.md              ← 排坑指南
├── SpringBoot-桌面应用打包方案对比.md           ← 桌面部署
├── SpringBoot-离线桌面应用架构设计.md           ← 桌面部署
└── SpringBoot-GraalVM与Launch4j打包-配置指南.md ← 配置指南
```

---

## 一、框架机制（1 篇）

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=自动装配原理与MVC生命周期">SpringBoot3-自动装配原理与MVC生命周期</a> | @SpringBootApplication 的 4 步自动装配流程、5 种条件注解速查、DispatcherServlet 10 步请求流水线、404/400/403/415 错误定位表、SB2 vs SB3 对比 |

---

## 二、持久层（1 篇）

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=MyBatis-Plus工程化实践">MyBatis-Plus工程化实践</a> | BaseMapper 自动生成 CRUD SQL 的反射+泛型注入原理、LambdaQueryWrapper 消除字段硬编码、12 个条件方法速查、分页 + 防全表更新拦截器、MP vs MyBatis vs JPA 选型对比 |

---

## 三、安全架构（2 篇）

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=JWT无状态鉴权与安全机制">JWT无状态鉴权与安全机制</a> | Header.Payload.Signature 三段式结构、签名防伪数学原理、完整生命周期（生成→传输→验签→解析）、JWT vs Session 优缺点对比、5 条生产最佳实践 |
| <a href="obsidian://open?file=RBAC权限模型与五表设计">RBAC权限模型与五表设计</a> | 用户↔角色↔菜单三层解耦、五表 ER 图与字段设计、权限流转全景（配置→登录→后端返回→前端渲染）、@RequiresPermission 注解+AOP、v-hasPermi 自定义指令 |

---

## 四、排坑指南（1 篇）

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=生产环境避坑实录">SpringBoot-生产环境避坑实录</a> | CORS OPTIONS 预检请求 401 机理与修复、循环中查数据库导致连接池耗尽（杀手级代码）、@Transactional 事务失效三大场景（this调用/异常被吞/非public）、连接池参数调优参考 |

## 五、桌面部署（2 篇 + 1 配置指南）

> 将 Spring Boot 从服务端 Web 应用改造为纯离线 Windows .exe 桌面程序。

| 笔记 | 一句话说明 |
|------|-----------|
| <a href="obsidian://open?file=桌面应用打包方案对比">SpringBoot-桌面应用打包方案对比</a> | GraalVM Native Image vs JPackage/Launch4j vs Electron/Tauri 三种方案的全维度对比表（是否需要 JRE/启动速度/内存/兼容性/UI 能力）、GraalVM AOT 编译命令、Electron 主进程拉起 Java 后端的生命周期代码 |
| <a href="obsidian://open?file=离线桌面应用架构设计">SpringBoot-离线桌面应用架构设计</a> | Vue 3 + Electron + Spring Boot + SQLite 全栈离线架构数据流向图、Electron 主进程完整代码（child_process + before-quit 清理）、Spring Boot 离线优化三件套（随机端口/SQLite/关闭不必要功能）、Tauri vs Electron 选型 |
| <a href="obsidian://open?file=GraalVM与Launch4j打包-配置指南">SpringBoot-GraalVM与Launch4j打包-配置指南</a> | 配置指南：GraalVM 安装（Windows/macOS/Linux）、Maven native-image 插件配置、Launch4j 零代码改动打包、SQLite 数据源配置、常见反射/代理兼容性问题 |

---

## 五、推荐学习路径

```
第一阶段：框架机制
  └─ SpringBoot3 自动装配 → DispatcherServlet 请求流水线

第二阶段：持久层
  └─ MyBatis-Plus BaseMapper → LambdaQueryWrapper → 拦截器

第三阶段：安全架构
  └─ JWT 无状态鉴权 → RBAC 五表权限模型 → 前后端权限校验

第四阶段：上线前必读
  └─ CORS 预检 → 连接池耗尽 → 事务失效 → 避坑清单
```

---

## 六、跨领域关联

| SpringBoot 主题          | 关联领域    | 具体笔记                                                                                                                             |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| JWT Token 存储与路由守卫      | 前端      | <a href="obsidian://open?file=Pinia状态管理核心设计">Pinia状态管理核心设计</a> — Token 存入 Pinia，路由守卫从 Pinia 读取判断登录态                              |
| RBAC 动态路由注入            | 前端      | <a href="obsidian://open?file=响应式引擎与CompositionAPI">Vue3-响应式引擎与CompositionAPI</a> — 后端返回权限树 JSON → `router.addRoute()` 动态注册 |
| Axios 统一契约             | 前端      | <a href="obsidian://open?file=Vite构建工具原理与优势">Vite构建工具原理与优势</a> — 前后端约定 Result 格式，Axios 拦截器剥离 code/msg 外壳                         |
| DispatcherServlet 流水线  | Java 基础 | <a href="obsidian://open?file=异常处理">Java-异常处理</a> — 全局异常处理器 @RestControllerAdvice 兜底机制                                      |
| MyBatis-Plus Lambda 查询 | 数据库     | <a href="obsidian://open?file=索引视图与存储过程">数据库系统概论-索引视图与存储过程</a> — WHERE 条件需要索引配合                                          |
| JWT Token 黑名单          | 数据库     | <a href="obsidian://open?file=Redis-高性能原理与数据结构">Redis-高性能原理与数据结构</a> — Redis String + TTL 实现短期黑名单                                |
| RBAC 权限树缓存             | 数据库     | <a href="obsidian://open?file=Redis-高性能原理与数据结构">Redis-高性能原理与数据结构</a> — Redis Hash 存储权限树 JSON                                     |
| MySQL 连接池              | 数据库     | <a href="obsidian://open?file=MySQL-InnoDB索引与MVCC详解">MySQL-InnoDB索引与MVCC详解</a> — 连接池耗尽场景覆盖                                       |

---

## 七、标签统计

| 标签 | 使用次数 | 覆盖笔记 |
|------|----------|----------|
| `Java/SpringBoot` | 4 | 自动装配、生产避坑、打包方案、离线架构 |
| `Java/MyBatis` | 1 | MyBatis-Plus |
| `Java/安全` | 2 | JWT、RBAC |
| `Java/排坑` | 1 | 生产环境避坑 |

> 📂 所属：[[MOC - Java后端]]
