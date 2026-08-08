---
aliases: [运维 MOC, DevOps MOC]
tags: [status/进行中, type/MOC, 运维]
created: "2026-06-18"
updated: "2026-06-29"
知识体系: "DevOps/运维"
---

# MOC - 运维

> 运维与部署相关知识。涵盖版本控制(Git)、网关代理(Nginx)、容器编排(Docker)三大板块，支撑 CI/CD 全流程。| 20 篇笔记（含 Git 子 MOC 10 篇 + Nginx 子 MOC 8 篇）。

## 目录结构树

```text
运维/
├── MOC - 运维.md                          ← 本文件
│
├── 【容器与部署】
├── Docker-Compose全栈部署与网络拓扑.md      ← 容器编排
│
├── Nginx/                                   ← 网关代理子目录
│   ├── MOC - Nginx.md                       ← Nginx 知识地图（8 篇）
│   ├── Nginx-核心概念与安装配置.md
│   ├── Nginx-反向代理与负载均衡.md
│   ├── Nginx-静态资源服务与虚拟主机.md
│   ├── Nginx-HTTPS性能优化与运维.md
│   └── ...（含4篇配置指南）
├── Nginx网关配置与SPA刷新问题.md            ← 反向代理与静态服务（独立笔记）
│
└── Git/                                   ← 版本控制子目录
    ├── MOC - Git.md                       ← Git 知识地图（10 篇）
    ├── Git-分布式版本控制核心概念.md
    ├── Git-基本操作与历史管理.md
    ├── Git-分支管理与合并策略.md
    ├── Git-远程仓库与团队协作.md
    ├── Git-高级技巧与故障恢复.md
    ├── Git-环境配置与项目初始化.md
    ├── Git-基本操作-环境配置与项目初始化.md
    ├── Git-分支管理-环境配置与项目初始化.md
    ├── Git-远程协作-环境配置与项目初始化.md
    └── Git-高级技巧-环境配置与项目初始化.md
```

## 分板块笔记列表

### 板块一：版本控制（Git）
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=MOC - Git">MOC - Git</a> | MOC | Git 完整知识地图，含学习路径和标签统计 |
| <a href="obsidian://open?file=分布式版本控制核心概念">Git 分布式版本控制核心概念</a> | 知识笔记 | 四大工作区模型、Git vs SVN、设计哲学 |
| <a href="obsidian://open?file=基本操作与历史管理">Git 基本操作与历史管理</a> | 知识笔记 | add/commit/log/reset/restore 日常命令全集 |
| <a href="obsidian://open?file=分支管理与合并策略">Git 分支管理与合并策略</a> | 知识笔记 | merge/rebase、冲突解决、Git Flow/GitHub Flow |
| <a href="obsidian://open?file=远程仓库与团队协作">Git 远程仓库与团队协作</a> | 知识笔记 | push/pull/PR/Code Review 协作工作流 |
| <a href="obsidian://open?file=高级技巧与故障恢复">Git 高级技巧与故障恢复</a> | 知识笔记 | stash/reflog/cherry-pick/hooks/submodule |
| <a href="obsidian://open?file=环境配置与项目初始化">Git 环境配置与项目初始化</a> | 配置指南 | 全平台安装、SSH、首次配置 |

### 板块二：容器化
| 笔记 | 简介 |
|------|------|
| <a href="obsidian://open?file=Compose全栈部署与网络拓扑">Docker-Compose全栈部署与网络拓扑</a> | 多容器编排、网络模式、环境变量注入 |

### 板块三：网关代理（Nginx）
| 笔记 | 简介 |
|------|------|
| <a href="obsidian://open?file=MOC - Nginx">MOC - Nginx</a> | Nginx 完整知识地图（核心概念/反向代理/静态服务/HTTPS/性能优化） |
| <a href="obsidian://open?file=Nginx网关配置与SPA刷新问题">Nginx网关配置与SPA刷新问题</a> | 反向代理、try_files、SPA History 模式（独立笔记） |

## 推荐学习路径

```text
阶段一：版本控制基础（1-2 周）
  Git-分布式版本控制核心概念 → Git-基本操作与历史管理 → Git-分支管理与合并策略

阶段二：团队协作（1 周）
  Git-远程仓库与团队协作 → Git-高级技巧与故障恢复

阶段三：部署与运维
  Docker-Compose全栈部署 → Nginx 网关配置
```

## 跨领域关联表

| 关联领域 | 关联说明 |
|---------|---------|
| <a href="obsidian://open?file=MOC - 后端">MOC - 后端</a> | 后端应用通过 Docker 容器化部署，代码由 Git 版本管理 |
| <a href="obsidian://open?file=MOC - 前端">MOC - 前端</a> | 前端 SPA 通过 Nginx 静态服务部署，Git 管理前端代码 |
| <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a> | 版本控制 + CI/CD 是软件工程配置管理的核心实践 |

## 标签使用统计

| 标签 | 出现次数 |
|------|---------|
| `运维/Git` | 10 |
| `运维/Nginx` | 8 |
| `type/笔记` | 9 |
| `type/教程` | 9 |
| `type/MOC` | 3 |

> 📂 所属：[[MOC - 知识库总览]]

