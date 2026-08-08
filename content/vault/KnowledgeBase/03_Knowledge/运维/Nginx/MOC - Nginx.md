---
aliases: [Nginx MOC, Nginx 知识地图]
tags: [status/进行中, type/MOC, 运维/Nginx]
created: "2026-06-29"
updated: "2026-06-29"
知识体系: "DevOps/运维 → L3 编排与网关"
---

# MOC - Nginx

> Nginx 知识地图——高性能 HTTP 与反向代理服务器。覆盖核心概念、反向代理/负载均衡、静态资源服务、HTTPS 与性能优化四大板块。| 8 篇笔记（4 知识笔记 + 4 配置指南）。

## 目录结构树

```text
运维/Nginx/
├── MOC - Nginx.md                            ← 本文件
│
├── 【知识笔记】
├── Nginx-核心概念与安装配置.md                 ← 入门第一站
├── Nginx-反向代理与负载均衡.md                 ← 核心能力
├── Nginx-静态资源服务与虚拟主机.md              ← 前端部署
├── Nginx-HTTPS性能优化与运维.md                ← 生产级网关
│
├── 【配置指南】
├── Nginx-环境配置与项目初始化.md                ← 安装 + Hello World
├── Nginx-反向代理-环境配置.md                   ← proxy_pass + upstream
├── Nginx-静态资源-环境配置.md                   ← root/alias + 虚拟主机
└── Nginx-HTTPS运维-环境配置.md                 ← SSL + 性能 + 日志
```

## 分板块笔记列表

### 板块一：核心概念
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=核心概念与安装配置">Nginx 核心概念与安装配置</a> | 知识笔记 | 事件驱动架构、vs Apache、源码/Docker 安装、nginx.conf 结构 |
| <a href="obsidian://open?file=环境配置与项目初始化">Nginx 环境配置与项目初始化</a> | 配置指南 | 多平台安装、Hello World、管理命令 |

### 板块二：反向代理
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=反向代理与负载均衡">Nginx 反向代理与负载均衡</a> | 知识笔记 | 正向/反向代理区别、upstream 三种算法、CORS 解决、WebSocket 代理 |
| <a href="obsidian://open?file=反向代理-环境配置">Nginx 反向代理配置指南</a> | 配置指南 | proxy_pass 规则、负载均衡模板、路径转发 |

### 板块三：静态服务
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=静态资源服务与虚拟主机">Nginx 静态资源服务与虚拟主机</a> | 知识笔记 | root vs alias、多站点、动静态分离、SpringBoot+Vue 全栈部署 |
| <a href="obsidian://open?file=静态资源-环境配置">Nginx 静态资源配置指南</a> | 配置指南 | 静态站点模板、虚拟主机、动静态分离配置 |

### 板块四：HTTPS 与运维
| 笔记 | 类型 | 简介 |
|------|------|------|
| <a href="obsidian://open?file=HTTPS性能优化与运维">Nginx HTTPS、性能优化与运维</a> | 知识笔记 | Let's Encrypt、gzip、缓存、worker 调优、日志分析、防盗链 |
| <a href="obsidian://open?file=HTTPS运维-环境配置">Nginx HTTPS 运维配置指南</a> | 配置指南 | Certbot 自动 HTTPS、性能调优参数、日志配置 |

## 推荐学习路径

```text
阶段一：入门（1 天）
  Nginx-核心概念与安装配置 → Nginx-环境配置与项目初始化

阶段二：代理（2-3 天）
  Nginx-反向代理与负载均衡

阶段三：部署（1-2 天）
  Nginx-静态资源服务与虚拟主机

阶段四：生产（1-2 天）
  Nginx-HTTPS性能优化与运维
```

## 跨领域关联表

| 关联领域 | 关联说明 |
|---------|---------|
| <a href="obsidian://open?file=Nginx网关配置与SPA刷新问题">Nginx 网关配置与 SPA 刷新问题</a> | 同目录已有笔记：try_files 解决 SPA History 模式 404 |
| <a href="obsidian://open?file=Compose全栈部署与网络拓扑">Docker-Compose 全栈部署</a> | Nginx 作为前端网关，Docker 管理后端服务 |
| <a href="obsidian://open?file=XD-3 计算机网络">XD-3 计算机网络</a> | HTTP/TCP/DNS 是理解 Nginx 代理转发的基础 |
| <a href="obsidian://open?file=XD-2 操作系统">XD-2 操作系统</a> | epoll 事件驱动、零拷贝 sendfile、I/O 多路复用 |

## 标签使用统计

| 标签 | 出现次数 |
|------|---------|
| `运维/Nginx` | 8 |
| `status/进行中` | 8 |
| `type/笔记` | 4 |
| `type/教程` | 4 |

> 📂 所属：[[MOC - 运维]]
