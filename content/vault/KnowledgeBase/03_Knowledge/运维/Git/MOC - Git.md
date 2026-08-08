---
aliases: [Git MOC, Git 知识地图]
tags: [status/进行中, type/MOC, 运维/Git]
created: "2026-06-29"
updated: "2026-06-29"
知识体系: "DevOps/运维"
---

# MOC - Git

> Git 分布式版本控制系统知识地图。从核心概念到高级技巧，覆盖日常开发所需的全套 Git 技能。| 10 篇笔记（5 知识笔记 + 5 配置指南）。

## 目录结构树

```text
Git/
├── MOC - Git.md                          ← 本文件
│
├── 【知识笔记】
├── Git-分布式版本控制核心概念.md           ← 入门第一站
├── Git-基本操作与历史管理.md               ← 日常高频命令
├── Git-分支管理与合并策略.md               ← 协作核心能力
├── Git-远程仓库与团队协作.md               ← 多人协作工作流
├── Git-高级技巧与故障恢复.md               ← 进阶与救急
│
├── 【配置指南】
├── Git-环境配置与项目初始化.md             ← 安装 + SSH + 首次配置
├── Git-基本操作-环境配置与项目初始化.md     ← 编辑器/Diff 工具优化
├── Git-分支管理-环境配置与项目初始化.md     ← Merge 工具/分支规范
├── Git-远程协作-环境配置与项目初始化.md     ← SSH 多账号/凭据管理
└── Git-高级技巧-环境配置与项目初始化.md     ← Hooks/子模块/别名
```

## 分板块笔记列表

### 板块一：核心概念
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=分布式版本控制核心概念">Git 分布式版本控制核心概念</a> | 知识笔记 | 四大工作区模型、Git vs SVN 对比、SHA-1 哈希、分布式设计哲学 |

### 板块二：日常操作
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=基本操作与历史管理">Git 基本操作与历史管理</a> | 知识笔记 | init/add/commit/log/reset/restore 的完整用法与避坑指南 |
| <a href="obsidian://open?file=基本操作-环境配置与项目初始化">Git 基本操作环境配置</a> | 配置指南 | 编辑器、Diff 工具、颜色优化、自动纠错 |
| <a href="obsidian://open?file=环境配置与项目初始化">Git 环境配置与项目初始化</a> | 配置指南 | 全平台安装、SSH 密钥、.gitignore、核心配置项 |

### 板块三：分支管理
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=分支管理与合并策略">Git 分支管理与合并策略</a> | 知识笔记 | branch/merge/rebase、冲突解决、Git Flow/GitHub Flow/简化版策略 |
| <a href="obsidian://open?file=分支管理-环境配置与项目初始化">Git 分支管理环境配置</a> | 配置指南 | Merge 工具、Diff 算法、分支命名规范、PR 模板 |

### 板块四：远程协作
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=远程仓库与团队协作">Git 远程仓库与团队协作</a> | 知识笔记 | remote/clone/push/pull/fetch、PR 工作流、Code Review 最佳实践 |
| <a href="obsidian://open?file=远程协作-环境配置与项目初始化">Git 远程协作环境配置</a> | 配置指南 | SSH 多账号、HTTPS 凭据、安全强制推送 |

### 板块五：高级技巧
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=高级技巧与故障恢复">Git 高级技巧与故障恢复</a> | 知识笔记 | stash/reflog/cherry-pick/submodule/hooks、仓库优化、大文件清理 |
| <a href="obsidian://open?file=高级技巧-环境配置与项目初始化">Git 高级技巧环境配置</a> | 配置指南 | Husky、全局 .gitignore、性能调优、实用别名 |

## 推荐学习路径

```text
阶段一：入门（1-2 天）
  Git-分布式版本控制核心概念  →  Git-环境配置与项目初始化
  理解 Git 是什么 + 完成安装配置

阶段二：日常使用（1 周）
  Git-基本操作与历史管理  →  Git-基本操作-环境配置与项目初始化
  掌握 add/commit/log/reset，形成肌肉记忆

阶段三：协作核心（1-2 周）
  Git-分支管理与合并策略  →  Git-远程仓库与团队协作
  学会分支工作流 + PR/Code Review

阶段四：进阶（持续）
  Git-高级技巧与故障恢复
  熟练 stash/reflog/cherry-pick，遇到问题不慌
```

## 跨领域关联表

| 关联领域 | 关联说明 |
|---------|---------|
| <a href="obsidian://open?file=Compose全栈部署与网络拓扑">Docker-Compose 全栈部署</a> | Git 仓库是 CI/CD 管道的代码源，提交即触发构建 |
| <a href="obsidian://open?file=Nginx网关配置与SPA刷新问题">Nginx 网关配置</a> | 代码经 Git 推送后，部署到 Nginx 静态服务器 |
| <a href="obsidian://open?file=XD-6 软件工程与架构">XD-6 软件工程与架构</a> | 版本控制是软件工程配置管理的核心实践 |
| <a href="obsidian://open?file=XD-5 数据结构与算法">XD-5 数据结构与算法</a> | Git 底层以 DAG 组织提交历史，SHA-1 哈希寻址 |

## 标签使用统计

| 标签 | 出现次数 |
|------|---------|
| `运维/Git` | 10 |
| `status/进行中` | 10 |
| `type/笔记` | 5 |
| `type/教程` | 5 |

> 📂 所属：[[MOC - 运维]]
