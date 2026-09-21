# 基于 Nuxt 4 与 PostgreSQL 的极简高级个人数字花园系统架构与落地实施计划书

## 系统的整体架构与设计哲学

个人知识管理系统正在经历从静态站点生成向双向同步、动态图谱与服务端渲染（SSR）深度融合的全栈知识花园演进。传统静态生成工具在处理大规模双向链接图谱查询、毫秒级全文检索以及实时 Web 端反向同步时存在天然局限。基于 Vue 3 与 Nuxt 4 全栈框架，结合 PostgreSQL 18 的半结构化存储与关系图谱能力，能够搭建一套高扩展性、极致护眼且完全掌控数据的数字花园系统。

```
/content/vault (本地/云服务器同步目录)
       │
       ▼ (Chokidar 文件变动监听)
server/plugins/watcher.ts (Nitro 服务端插件)
       │
       ▼ (Unified / Remark / Rehype AST 引擎)
server/utils/markdown.ts (解析 YAML, WikiLinks, Math, Shiki)
       │
       ▼ (Prisma ORM 事务写入)
PostgreSQL 18 (JSONB 元数据 + 关系图谱 + 全文索引)
       │
       ▼ (Nuxt 4 Nitro RESTful APIs)
app/ (Vue 3 SSR 前端渲染 / Tailwind CSS / D3 图谱)
```

系统的数据管道构建于“本地无感写作-服务端文件监听-抽象语法树（AST）解析-关系数据库持久化-高能 Hydration 渲染”全链路之上。用户在本地 Obsidian 中撰写 Markdown 文档，通过 Syncthing 后台服务实现本地与云服务器 `/content/vault` 磁盘目录的秒级双向同步。Nuxt 4 内置 Nitro 引擎的服务端插件在系统启动时挂载 Chokidar 文件监听器，实时捕获文件的创建、修改与删除事件。一旦触发文件变更，后端利用 Unified 生态（Remark 与 Rehype）提取 YAML Frontmatter 元数据、解析 Obsidian 特有的 `[[WikiLinks]]` 双向引用关系，生成结构化 HTML 节点并以事务方式写入 PostgreSQL 18 数据库。前端 Vue 3 应用利用服务端渲染（SSR）直接加载数据库中的结构化文本与图谱拓扑，提供沉浸式护眼阅读与交互体验。

| **架构维度**             | **Nuxt 4 + PostgreSQL 全栈架构 (本方案)**                 | **Spring Boot 3 + Vue 3 分离架构**                       | **静态站点生成方案 (如 Quartz / Hugo)**                  |
| ------------------------ | --------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| **运行时资源占用**       | Node.js / Nitro 运行时仅需 50MB-100MB 内存                | JVM 进程基础占用 300MB-500MB+ 内存                       | 无服务端进程，仅依赖静态托管                             |
| **Markdown 与 AST 生态** | 统一采用 TypeScript/JS 的 Remark/Rehype 繁荣生态          | 依赖 Java Flexmark 库，解析新语法与自定义 AST 扩展较繁琐 | 依赖构建时解析，无法实现运行时动态 API 响应              |
| **功能扩展复杂度**       | 目录即路由，新增 `.vue` 页面或 `.ts` API 零额外配置       | 需逐层编写 Controller、Service、Mapper 与前端 Route      | 仅限静态渲染，难以接入用户鉴权与私有笔记权限控制         |
| **关系图谱与检索**       | 基于 PostgreSQL CTE 递归查询与 JSONB GIN 索引，毫秒级响应 | 需额外配置 MySQL 复杂关联或 Elasticsearch 搜索引擎       | 依赖前端生成全量 JSON 索引，海量笔记下传输与渲染性能下降 |
| **SEO 与首屏渲染**       | 原生 SSR/SSG，搜索引擎收录与首屏加载速度极佳              | 前后端分离纯 SPA 模式，需额外搭建 SSR 代理层             | 原生静态 HTML，SEO 极佳但缺乏动态交互能力                |



## 数据库 Schema 与数据建模规范

在知识库建模中，选用 PostgreSQL 能够完美解决半结构化 YAML 元数据存储与复杂网络图谱检索的矛盾。Obsidian 笔记的头部 Frontmatter 属性往往具有高度动态性，例如标签数组、成熟度标识、自定义别名等；通过 PostgreSQL 的 JSONB 字段结合 GIN 索引，无需每次在新增 Frontmatter 属性时修改数据库表结构。针对 Obsidian 核心的 `[[WikiLinks]]` 双向链接拓扑，设计独立的边关系表，利用公用表表达式（CTE）能够轻松实现深度图谱遍历与反向链接（Backlinks）检索。

代码段

```
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Maturity {
  SEEDLING  // 幼苗
  GROWING   // 成长
  EVERGREEN // 常青/归档
}

model Note {
  id           String     @id @default(uuid())
  slug         String     @unique // 唯一 URL 别名或文件相对路径标识
  title        String
  content      String     @db.Text // Markdown 源码
  htmlContent  String     @db.Text // AST 渲染后的 HTML
  summary      String?    @db.Text // 自动截取的正文摘要
  maturity     Maturity   @default(SEEDLING)
  isPublished  Boolean    @default(true)
  metadata     Json       @default("{}") // 存储解析后的 JSONB YAML 动态字段
  readingTime  Int        @default(0)    // 预计阅读时长
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  tags         NoteTag[]
  outgoing     NoteLink[] @relation("OutgoingLinks")
  incoming     NoteLink[] @relation("IncomingLinks")

  @@index([slug])
  @@index([isPublished])
  @@index([maturity])
}

model Tag {
  id    Int       @id @default(autoincrement())
  name  String    @unique
  notes NoteTag[]
}

model NoteTag {
  noteId String
  tagId  Int
  note   Note   @relation(fields: [noteId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([noteId, tagId])
}

model NoteLink {
  sourceId String
  targetId String
  source   Note   @relation("OutgoingLinks", fields: [sourceId], references: [id], onDelete: Cascade)
  target   Note   @relation("IncomingLinks", fields: [targetId], references: [id], onDelete: Cascade)

  @@id([sourceId, targetId])
}
```

## 项目规范工程结构

本工程完全按照 Nuxt 4 的最新架构规范打造，将前端 UI 渲染逻辑存放在 `app/` 目录下，将 Server 端 API、Plugin 与工具库收拢在 `server/` 目录下，实现前后台的完全解耦与模块化扩展。

```
my-digital-garden/
├── app/                        # 前端 Vue 3 应用根目录 (Nuxt 4 标准规范)
│   ├── assets/                 # 样式与静态资源
│   │   └── css/
│   │       └── main.css        # 全局护眼色彩系统与 Tailwind CSS 引入
│   ├── components/             # 复用 Vue 组件
│   │   ├── ArticleReader.vue   # 沉浸式文章阅读器组件
│   │   ├── GraphView.vue       # D3/Canvas 力导向图谱渲染组件
│   │   ├── HeaderNav.vue       # 顶栏导航与模式切换组件
│   │   └── TocTree.vue         # 动态文章目录树组件
│   ├── composables/            # Vue 3 组合式 API
│   │   ├── useNotes.ts         # 笔记数据交互与状态管理
│   │   └── useTheme.ts         # 昼夜/暖调护眼主题控制逻辑
│   ├── layouts/
│   │   └── default.vue         # 系统默认响应式网格布局
│   └── pages/                  # 基于文件系统的动态路由
│       ├── index.vue           # 知识花园首页
│       ├── graph.vue           # 全局交互式知识网格图谱页
│       └── notes/
│           ├── index.vue       # 笔记列表与多维检索页
│           └── [slug].vue      # 笔记详情与沉浸式阅读页
├── server/                     # Nitro 服务端根目录
│   ├── api/                    # RESTful API 路由句柄
│   │   └── notes/
│   │       ├── index.get.ts    # 分页、标签筛选与全文搜索 API
│   │       ├── [slug].get.ts   # 笔记详情与反向链接 API
│   │       └── graph.get.ts    # 全站图谱节点与边数据 API
│   ├── plugins/                # Nitro 运行时插件
│   │   └── watcher.ts          # Chokidar 磁盘文件实时监听插件
│   └── utils/                  # 服务端单例工具集
│       ├── db.ts               # Prisma Client 单例初始化
│       └── markdown.ts         # Unified AST 管道与双向链接解析工具
├── prisma/
│   └── schema.prisma           # PostgreSQL 数据模型定义文件
├── content/
│   └── vault/                  # Syncthing 双向同步存储目录
├── .env                        # 环境变量配置文件
├── nuxt.config.ts              # Nuxt 4 主配置文件
├── tailwind.config.js          # Tailwind CSS 响应式与主题配置
└── package.json                # 项目依赖管理文件
```

## 核心功能模块详细设计与代码实现

### 文件监听与后台同步模块 (`server/plugins/watcher.ts`)

在 Nitro 服务端运行时加载此插件，通过 Chokidar 深度监听服务器磁盘 `/content/vault` 路径。该模块包含防抖处理与自动恢复机制，确保在 Syncthing 进行大批量文件同步时不会导致高频重复解析。

TypeScript

```
import chokidar from 'chokidar'
import path from 'path'
import { defineNitroPlugin } from '#imports'
import { processMarkdownFile, removeMarkdownFile } from '../utils/markdown'

export default defineNitroPlugin((nitroApp) => {
  const vaultPath = path.resolve(process.cwd(), 'content/vault')

  const watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100
    }
  })

  watcher
    .on('add', async (filePath) => {
      if (filePath.endsWith('.md')) {
        await processMarkdownFile(filePath)
      }
    })
    .on('change', async (filePath) => {
      if (filePath.endsWith('.md')) {
        await processMarkdownFile(filePath)
      }
    })
    .on('unlink', async (filePath) => {
      if (filePath.endsWith('.md')) {
        await removeMarkdownFile(filePath)
      }
    })

  nitroApp.hooks.hook('close', () => {
    watcher.close()
  })
})
```

### AST 解析与关系提取管道 (`server/utils/markdown.ts`)

解析引擎采用 Unified 架构，通过编译 AST 树完成 Obsidian 特有语法的转换。核心机制是将 `[[WikiLinks]]` 正则匹配并构建指向 `/notes/[slug]` 的标准化 HTML 锚点，同时记录出链 Slug 集合用于后续写入数据库 `NoteLink` 关系表。

TypeScript

```
import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import rehypeShiki from '@shikijs/rehype'
import { prisma } from './db'

export async function processMarkdownFile(filePath: string) {
  const fileContent = await fs.readFile(filePath, 'utf-8')
  const relativePath = path.relative(path.resolve(process.cwd(), 'content/vault'), filePath)
  const slug = relativePath.replace(/\.md$/, '').replace(/\\/g, '/')

  const { data: frontmatter, content: rawMarkdown } = matter(fileContent)
  const title = frontmatter.title || path.basename(slug)
  const maturity = (frontmatter.maturity || 'SEEDLING').toUpperCase()
  const isPublished = frontmatter.published !== false

  const wikiLinkRegex = /\[\[(.*?)(?:\|(.*?))?\]\]/g
  const outgoingSlugs: string[] = []
  let match
  while ((match = wikiLinkRegex.exec(rawMarkdown)) !== null) {
    outgoingSlugs.push(match[1].trim())
  }

  const processedMarkdown = rawMarkdown.replace(wikiLinkRegex, (_, target, display) => {
    const text = display || target
    return `[${text}](/notes/${target})`
  })

  const htmlResult = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeShiki, { theme: 'nord' })
    .use(rehypeStringify)
    .process(processedMarkdown)

  const htmlContent = htmlResult.toString()

  await prisma.$transaction(async (tx) => {
    const note = await tx.note.upsert({
      where: { slug },
      update: {
        title,
        content: rawMarkdown,
        htmlContent,
        maturity,
        isPublished,
        metadata: frontmatter,
        updatedAt: new Date()
      },
      create: {
        slug,
        title,
        content: rawMarkdown,
        htmlContent,
        maturity,
        isPublished,
        metadata: frontmatter
      }
    })

    if (Array.isArray(frontmatter.tags)) {
      await tx.noteTag.deleteMany({ where: { noteId: note.id } })
      for (const tagName of frontmatter.tags) {
        const tag = await tx.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName }
        })
        await tx.noteTag.create({
          data: { noteId: note.id, tagId: tag.id }
        })
      }
    }

    await tx.noteLink.deleteMany({ where: { sourceId: note.id } })
    for (const targetSlug of outgoingSlugs) {
      const targetNote = await tx.note.findUnique({ where: { slug: targetSlug } })
      if (targetNote) {
        await tx.noteLink.create({
          data: { sourceId: note.id, targetId: targetNote.id }
        })
      }
    }
  })
}

export async function removeMarkdownFile(filePath: string) {
  const relativePath = path.relative(path.resolve(process.cwd(), 'content/vault'), filePath)
  const slug = relativePath.replace(/\.md$/, '').replace(/\\/g, '/')
  await prisma.note.delete({ where: { slug } }).catch(() => {})
}
```

### 服务端数据库单例与 API 接口实现

数据库单例模组 (`server/utils/db.ts`) 防止在开发阶段由于 Nitro 热更新导致连接池爆满。

TypeScript

```
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

单篇笔记详情与反向链接 API (`server/api/notes/[slug].get.ts`) 能够在服务端获取笔记正文的同时，高效地查询出所有引用了该笔记的宿主页面。

TypeScript

```
import { createError, defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug

  if (!slug) {
    throw createError({ statusCode: 400, message: 'Invalid Slug' })
  }

  const note = await prisma.note.findUnique({
    where: { slug },
    include: {
      tags: { include: { tag: true } },
      incoming: {
        include: {
          source: {
            select: { slug: true, title: true, summary: true, updatedAt: true }
          }
        }
      }
    }
  })

  if (!note || !note.isPublished) {
    throw createError({ statusCode: 404, message: 'Note Not Found' })
  }

  return note
})
```

全站知识拓扑图谱 API (`server/api/notes/graph.get.ts`) 输出符合力导向图格式的节点与边数据。

TypeScript

```
import { defineEventHandler } from 'h3'
import { prisma } from '../../utils/db'

export default defineEventHandler(async () => {
  const notes = await prisma.note.findMany({
    where: { isPublished: true },
    select: { id: true, title: true, slug: true, maturity: true }
  })

  const links = await prisma.noteLink.findMany({
    select: { sourceId: true, targetId: true }
  })

  return {
    nodes: notes.map(n => ({ id: n.id, title: n.title, slug: n.slug, maturity: n.maturity })),
    edges: links.map(l => ({ source: l.sourceId, target: l.targetId }))
  }
})
```

### 极简高级视觉与护眼主题调色板

调色系统摒弃纯白（`#FFFFFF`）与纯黑（`#000000`）强对比，采用羊皮纸温润暖白（`#FBFBFA`）与暖灰墨色（`#121212`），有效缓解长时间阅读引起的视觉疲劳。

CSS

```
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg-primary: #FBFBFA;
    --text-primary: #121212;
    --text-secondary: #5A5A58;
    --accent-color: #8C6D46;
    --border-color: #E8E8E3;
    --card-bg: #F4F4F0;
  }

  .dark {
    --bg-primary: #121212;
    --text-primary: #E6E6E1;
    --text-secondary: #A0A09C;
    --accent-color: #D4A359;
    --border-color: #2A2A28;
    --card-bg: #1A1A18;
  }

  body {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    transition: background-color 0.3s ease, color 0.3s ease;
  }
}
```

### 前端状态管理与主渲染组件

全局响应式主题切换 Composables (`app/composables/useTheme.ts`) 控制网页的主题状态与持久化。

TypeScript

```
import { ref, onMounted } from 'vue'

export const useTheme = () => {
  const isDark = ref(false)

  const toggleTheme = () => {
    isDark.value = !isDark.value
    if (isDark.value) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  onMounted(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      isDark.value = true
      document.documentElement.classList.add('dark')
    }
  })

  return { isDark, toggleTheme }
}
```

沉浸式文章阅读器 Vue 组件 (`app/components/ArticleReader.vue`) 结合双向反向链接卡片展示。

代码段

```
<template>
  <article class="max-w-3xl mx-auto px-4 py-8">
    <header class="mb-8 border-b border-[var(--border-color)] pb-6">
      <div class="flex items-center gap-3 text-xs text-[var(--text-secondary)] mb-2">
        <span class="px-2 py-0.5 rounded bg-[var(--card-bg)] uppercase font-semibold">
          {{ note.maturity }}
        </span>
        <time>{{ formatDate(note.updatedAt) }}</time>
      </div>
      <h1 class="text-3xl font-bold tracking-tight mb-4">{{ note.title }}</h1>
      <div class="flex flex-wrap gap-2">
        <span 
          v-for="tag in note.tags" 
          :key="tag.tag.name"
          class="text-xs text-[var(--accent-color)] hover:underline cursor-pointer"
        >
          #{{ tag.tag.name }}
        </span>
      </div>
    </header>

    <div 
      class="prose dark:prose-invert max-w-none leading-relaxed text-lg"
      v-html="note.htmlContent"
    ></div>

    <footer class="mt-16 pt-8 border-t border-[var(--border-color)]">
      <h3 class="text-lg font-semibold mb-4">反向链接 (Backlinks)</h3>
      <div v-if="note.incoming?.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NuxtLink 
          v-for="link in note.incoming" 
          :key="link.source.slug"
          :to="`/notes/${link.source.slug}`"
          class="p-4 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] transition"
        >
          <div class="font-medium text-sm mb-1">{{ link.source.title }}</div>
          <div class="text-xs text-[var(--text-secondary)] line-clamp-2">
            {{ link.source.summary || '暂无摘要' }}
          </div>
        </NuxtLink>
      </div>
      <p v-else class="text-sm text-[var(--text-secondary)]">暂无引用此笔记的页面</p>
    </footer>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  note: any
}>()

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>
```

## 本地开发与环境调测

开发环境需要预先安装 Node.js (>= v18.18.0)、pnpm (>= 8.0.0)、Docker Compose V2 以及已配置好的本地 PostgreSQL 18 服务。

已验证的本地 PostgreSQL 路径与数据库信息：

- **Bin 路径**：`D:\develop\PostgreSQL\18\bin`
- **目标数据库名**：`digital_garden` (已成功创建)

首先，在项目根目录下配置本地 `.env` 环境变量文件：

代码段

```
DATABASE_URL="postgresql://postgres:你的实际密码@localhost:5432/digital_garden?schema=public"
PORT=3000
```

安装项目核心依赖包：

Bash

```
pnpm add prisma @prisma/client chokidar gray-matter unified remark-parse remark-gfm remark-math remark-rehype rehype-katex rehype-stringify @shikijs/rehype h3
pnpm add -D tailwindcss postcss autoprefixer
```

随后执行数据库 Schema 迁移与 Prisma Client 代码生成：

Bash

```
npx prisma migrate dev --name init
npx prisma generate
```

创建 Syncthing 本地同步映射目录并植入初始 Markdown 文档进行功能验证：

Bash

```
mkdir -p content/vault
echo "---\ntitle: 数字花园构建指南\ntags: [Vue3, Nuxt4, Architecture]\nmaturity: EVERGREEN\n---\n# 欢迎体验全栈数字花园\n系统支持 [[Obsidian]] 的双向链接语法与自动关系提取。" > content/vault/hello-world.md
```

启动本地开发服务器：

Bash

```
pnpm dev
```

控制台打印出 Nitro 服务端插件挂载及 Chokidar 成功监听 `/content/vault` 后，使用浏览器访问 `http://localhost:3000/notes/hello-world` 校验 AST 解析结果与数据库持久化映射。

## 云服务器部署与 DevOps 运维

生产环境托管建议配置：Ubuntu 22.04 LTS 云服务器，开放 80、443、8384 及 22000 端口，并预装 Docker Engine 与 Docker Compose CLI (V2)。

### Docker 容器化数据层编排 (`docker-compose.yml`)

在服务器 `/opt/digital-garden` 路径下部署数据库与无头（Headless）Syncthing 引擎。通过 `docker compose up -d` 即可一键拉起服务。

YAML

```
version: '3.8'

services:
  postgres:
    image: postgres:18-alpine
    container_name: garden-db
    restart: always
    environment:
      POSTGRES_USER: garden_user
      POSTGRES_PASSWORD: CHANGE_ME_STRONG_PASSWORD
      POSTGRES_DB: garden_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  syncthing:
    image: syncthing/syncthing:latest
    container_name: garden-syncthing
    hostname: cloud-server
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - /var/vault:/var/syncthing/Vault
    ports:
      - "8384:8384"
      - "22000:22000/tcp"
      - "22000:22000/udp"
      - "21027:21027/udp"
    restart: unless-stopped

volumes:
  pgdata:
```

### PM2 生产进程托管配置文件 (`ecosystem.config.js`)

Nuxt 4 全栈应用构建完成后生成纯净的 `.output` 执行打包产物，采用 PM2 进行多线程 Cluster 模式托管。

JavaScript

```
module.exports = {
  apps: [
    {
      name: 'digital-garden',
      port: '3000',
      exec_mode: 'cluster',
      instances: 'max',
      // 经包装器启动：nitro 产物的 _importMeta_ 占位路径在 Windows 下会使
      // 内联 Prisma 客户端抛 ERR_INVALID_FILE_URL_PATH，统一从包装器进入
      script: './scripts/start-prod.mjs',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://garden_user:CHANGE_ME_STRONG_PASSWORD@localhost:5432/garden_db?schema=public'
      }
    }
  ]
}
```

### Nginx 高性能反向代理与 SSL 配置文件 (`/etc/nginx/sites-available/garden.conf`)

Nginx

```
server {
    listen 80;
    server_name your-garden-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-garden-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-garden-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-garden-domain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## Agent 自动化执行路线图

本路线图为 AI 编码 Agent 提供了确定性的演进路径。Agent 可依据各阶段的指令规范与校验指标，顺序完成工程搭建。

| **执行阶段** | **阶段任务名称**          | **Agent 代码生成指令规范**                                   | **产出标准与验收指标**                                       |
| ------------ | ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **Phase 1**  | 脚手架与目录构建          | 执行 `npx nuxi@latest init`，配置 Nuxt 4 `app/` 与 `server/` 分离架构并安装依赖。 | 根目录结构校验通过，`pnpm dev` 无报错运行。                  |
| **Phase 2**  | 数据建模与数据库初始化    | 创建 `prisma/schema.prisma`，运行 `prisma migrate dev` 建立 PostgreSQL 实体。 | 数据库包含 `Note`、`Tag`、`NoteTag`、`NoteLink` 表。         |
| **Phase 3**  | Nitro 文件监听与 AST 解析 | 编写 `server/plugins/watcher.ts` 与 `server/utils/markdown.ts` 管道代码。 | 在 `/content/vault` 修改 `.md` 文件，PostgreSQL 数据同步更新。 |
| **Phase 4**  | 主题样式与阅读器 UI       | 实现 `main.css` 护眼色彩变量、`useTheme.ts` 以及 `ArticleReader.vue` 组件。 | 页面能够展示双向链接卡片，支持无缝暗黑模式切换。             |
| **Phase 5**  | RESTful API 与图谱渲染    | 实现 `/api/notes/` 详情、列表与全站图谱关系网 API，完成 D3 图谱组件。 | `/graph` 页面能够流畅呈现力导向节点与关联边。                |
| **Phase 6**  | 云端部署与 Docker 编排    | 编写 `docker-compose.yml`、`ecosystem.config.js` 与 Nginx 证书配置。 | 服务器上 Docker 容器启动正常，本地 Obsidian 修改秒级同步至线上。 |