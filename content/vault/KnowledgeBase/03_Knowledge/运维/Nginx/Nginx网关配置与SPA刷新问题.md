---
aliases: [Nginx网关, SPA刷新404, try_files, Gzip压缩, 反向代理, 跨域]
tags:
  - status/进行中
  - type/笔记
  - 运维/Nginx
created: "2026-06-16 12:30"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java全栈开发实战笔记(SpringBoot+Vue3).md"
知识体系: "DevOps/运维 → L3 编排与网关"
技术版本: "Nginx 1.24"
---

# Nginx 网关配置与 SPA 刷新 404 解决方案

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：DevOps/运维
- **所在层级**：DevOps/运维 → L3 编排与网关
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> Nginx 在全栈架构中扮演三大角色：① 静态资源服务器（前端 dist）② API 反向代理网关（解决跨域）③ 性能优化器（Gzip 压缩 + 缓存）。SPA 单页应用刷新 404 的本质是服务端找不到物理文件，通过 `try_files` 机制让 Vue Router 重新接管路由解析。

---

## 一、完整生产级 Nginx 配置

```nginx
server {
    listen 80;
    server_name www.yourdomain.com;

    # ========= 一、Gzip 压缩：极大提升前端加载性能 =========
    gzip on;
    gzip_min_length 1k;          # 小于 1KB 不压缩（压缩本身有开销）
    gzip_comp_level 6;           # 压缩级别 (1-9)，6 是性能与压缩率的平衡点
    gzip_types text/plain
               application/javascript
               application/x-javascript
               text/css
               application/xml
               text/javascript
               application/json;
    gzip_vary on;                # 告诉代理/CDN 区分压缩版和未压缩版
    gzip_disable "msie6";        # IE6 不压缩（兼容性）

    # ========= 二、前端静态资源处理 + SPA 刷新 404 兜底 =========
    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;

        # 【核心：SPA 刷新 404 的解决】
        # 当浏览器刷新 /user/list 页面时：
        #   ① Nginx 收到请求 /user/list
        #   ② 在 /usr/share/nginx/html/ 下找不到 user/list 这个物理文件
        #   ③ 传统 Nginx → 返回 404
        #   ④ 加了 try_files → 找不到时内部重定向到 /index.html
        #   ⑤ 浏览器收到 index.html → Vue Router 接管 URL 解析 → 渲染 /user/list 页面
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存策略
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        root /usr/share/nginx/html;
        expires 30d;              # 静态资源缓存 30 天（Vite 打包已经 hash 命名）
        add_header Cache-Control "public, immutable";
    }

    # ========= 三、后端 API 反向代理 =========
    location /api/ {
        # backend = Docker 内网域名（Docker DNS 自动解析）
        proxy_pass http://backend:8080/api/;

        # 把真实客户端信息通过 Header 传给 Java
        # 否则 Spring Boot 里 request.getRemoteAddr() 永远拿到的是 Nginx 的内网 IP
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时配置
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 上传文件大小限制
        client_max_body_size 10m;
    }

    # ========= 四、健康检查端点 =========
    location /health {
        access_log off;
        return 200 "OK";
    }
}
```

---

## 二、SPA 刷新 404 底层机理

```
问题场景：
  用户在 http://localhost/user/list 页面按 F5 刷新

  传统请求流程（没有 try_files）：
    浏览器 → GET /user/list → Nginx
    Nginx：检查 /usr/share/nginx/html/user/list 是否存在？
    → 不存在！→ 返回 404

  修复后的流程（有 try_files $uri $uri/ /index.html）：
    浏览器 → GET /user/list → Nginx
    Nginx：检查 /usr/share/nginx/html/user/list 是否存在？
    → 不存在！→ try_files 的第3个参数兜底 → 内部重定向到 /index.html
    → 返回 index.html 给浏览器
    → Vue Router 初始化 → 解析 URL /user/list → 渲染对应的组件
```

> `try_files` 的三个参数依次尝试：`$uri`（原路径文件）、`$uri/`（原路径目录）、`/index.html`（兜底回退)

---

## 三、反向代理为什么能解决跨域？

```
不通过 Nginx（浏览器直接请求后端）：
  前端 http://localhost:5173 → 后端 http://localhost:8080
  不同端口 = 不同源 → 浏览器拦截 = CORS Error

通过 Nginx 代理（浏览器只和 Nginx 通信）：
  前端 http://localhost → Nginx:80 → 内部转发 → backend:8080
  浏览器看到的始终是同一个 origin → 浏览器认为同源 → 不拦截！
```

---

## 四、关键性能数据：Gzip 压缩效果

| 文件类型 | 原始大小 | Gzip 后 | 压缩率 |
|----------|----------|---------|--------|
| app.abc123.js | 420 KB | 98 KB | **77%** |
| vendor.def456.js | 1.2 MB | 280 KB | **77%** |
| style.789.css | 85 KB | 15 KB | **82%** |
| index.html | 2.8 KB | 1.1 KB | **61%** |

> Gzip 对 JS/CSS 压缩率通常 70%~80%，对首屏加载速度提升显著。

---

## 关联上下文
- **前置知识**：📋 待补充：HTTP协议基础 — 理解反向代理和请求转发需要掌握 HTTP 请求/响应模型
- **横向对比**：📋 待补充：Nginx vs Caddy vs Traefik — Nginx 是传统网关首选，Caddy 自动 HTTPS 更简便，Traefik 在容器编排场景更智能
- **实际应用**：<a href="obsidian://open?file=Compose全栈部署与网络拓扑">Docker-Compose全栈部署与网络拓扑</a> — Nginx 容器通过 `proxy_pass http://backend:8080/` 利用 Docker 内网 DNS
- **进阶方向**：📋 待补充：Nginx高性能调优 — 多 worker 进程、event 驱动模型、连接池调优
- **易混淆概念**：📋 待补充：反向代理 vs 正向代理 vs 透明代理 — 反向代理服务端配置，正向代理客户端配置，透明代理对客户端透明
- **Docker Compose**：Nginx 容器通过 `proxy_pass http://backend:8080/` 利用 Docker 内网 DNS，详见 <a href="obsidian://open?file=Compose全栈部署与网络拓扑">Docker-Compose全栈部署与网络拓扑</a>
- **Vite 构建**：Vite 打包产物 `dist/` 直接挂载到 Nginx 容器，详见 <a href="obsidian://open?file=Vite构建工具原理与优势">Vite构建工具原理与优势</a>
- **CORS OPTIONS 拦截**：Nginx 转发请求时，OPTIONS 预检请求也必须到达后端并被放行，详见 CORS跨域与数据库连接池避坑（📋 待补充）

> 📂 所属：[[MOC - Nginx]]
