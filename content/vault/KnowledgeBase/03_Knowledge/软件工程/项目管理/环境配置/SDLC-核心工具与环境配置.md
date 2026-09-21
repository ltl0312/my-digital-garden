---
aliases: [项目管理工具, SDLC工具配置, 项目管理环境搭建]
maturity: SEEDLING
tags:
  - status/进行中
  - type/教程
created: "2026-07-17 21:18"
updated: "2026-07-17 21:18"
source: "官方文档：https://www.atlassian.com/software/jira （✅ 可访问）; https://linear.app （✅ 可访问）; https://www.figma.com （✅ 可访问）; https://www.notion.so （✅ 可访问）"
知识体系: "软件工程 → L0 项目管理方法论"
技术版本: "通用工具配置（无版本锁定）"
---

# 软件项目管理 — 核心工具与环境配置

## 信息来源
- **官方文档**：各工具官方文档均可访问
  - Jira：https://www.atlassian.com/software/jira ✅ 可访问
  - Linear：https://linear.app/docs ✅ 可访问
  - Figma：https://help.figma.com ✅ 可访问
  - Axure RP：https://docs.axure.com ✅ 可访问
  - Notion：https://www.notion.so/help ✅ 可访问

## 前置条件
- 操作系统：Windows 10+ / macOS 12+ / Linux
- 浏览器：Chrome 100+ 或 Edge 100+
- 网络：稳定的互联网连接（所有推荐工具以 SaaS 为主）

## Step 1: 项目任务管理工具

### 方案一：Jira（大型团队，推荐）
1. 访问 https://www.atlassian.com/software/jira → 注册账号
2. 创建项目 → 选择 "Scrum" 或 "Kanban" 模板
3. 配置 Sprint 周期（推荐 2 周）和工作流（To Do → In Progress → In Review → Done）
4. 邀请团队成员 → 分配角色（Admin / Member）

### 方案二：Linear（中小团队，推荐）
1. 访问 https://linear.app → 注册
2. 创建 Workspace → 创建 Team 和 Project
3. 使用 `Cmd/Ctrl + K` 快速创建 Issue

### 方案三：轻量替代（微团队/个人项目）
- GitHub Projects（免费，与代码仓库深度集成）
- Notion 数据库（灵活，适合非纯技术团队）
- Trello（看板式，最简单但功能有限）

## Step 2: 文档协作与需求管理

### PRD 与需求文档
- **Notion**（推荐）：访问 https://www.notion.so → 创建 Workspace → 使用 "Product Wiki" 模板
- **语雀**（国内替代）：访问 https://www.yuque.com
- **飞书文档**（国内替代）：深度集成飞书生态

### 流程图绘制
- **ProcessOn**（国内，免费）：https://www.processon.com → 支持在线协作
- **draw.io**（免费，离线可用）：https://app.diagrams.net
- **Lucidchart**（专业）：https://www.lucidchart.com

## Step 3: 原型设计工具

| 工具 | 用途 | 平台 | 价格 |
|------|------|------|------|
| **Figma** | UI/UX 设计协作（行业标杆） | Web/Desktop | 免费版够用 |
| **Axure RP** | 复杂交互原型（金融/企业级） | Win/Mac | 付费（$29/月） |
| **墨刀** | 国内轻量原型工具 | Web | 免费版可用 |
| **Sketch** | Mac 独占矢量设计 | macOS | $10/月 |

> **💡 推荐组合**：Figma（UI 设计 + 简单交互原型）+ Axure（复杂条件交互逻辑，如多步骤表单的条件跳转）+ 蓝湖/即时设计（国内替代与标注协作）

## Step 4: 接口管理与 Mock

- **Apifox**（国内推荐，API 设计+文档+Mock+测试一体化）：访问 https://apifox.com
- **Swagger / OpenAPI**（国际标准）：Spring Boot 集成 springdoc-openapi
- **Postman**（经典 API 调试工具）：https://www.postman.com

## Step 5: 代码托管与 CI/CD

- **GitHub**（国际，推荐）：https://github.com → 附带 GitHub Actions CI/CD
- **GitLab**（自托管/云）：https://about.gitlab.com → 内置 CI/CD
- **Gitee**（国内替代）：https://gitee.com → 访问速度更快

## 常见安装/配置问题

1. **Jira 太复杂学不会？** 
   → 先用 Trello 或 Linear 熟悉看板流程，再迁移到 Jira。Jira 的强大在于可定制性，但初期不要自定义太多——用默认模板就是最佳实践。
   
2. **Figma 国内访问慢？**
   → 使用 Figma 桌面客户端（www.figma.com/downloads）会比 Web 版稍快。国内替代方案：即时设计（js.design）、MasterGo。

3. **团队不愿意写文档？**
   → 这不是工具问题，是文化问题。建议：① 文档模板化降低写作成本；② 将 PRD 评审纳入开发流程（不写 PRD 不开工）；③ 使用 AI 辅助生成初稿（如 Notion AI）。

> 📂 所属：[[MOC - 软件工程]]
