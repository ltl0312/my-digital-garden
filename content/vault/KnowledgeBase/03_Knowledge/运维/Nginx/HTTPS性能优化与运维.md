---
aliases: [Nginx HTTPS, Nginx SSL, Certbot, Nginx 性能优化, Nginx 日志, Nginx gzip]
maturity: GROWING
tags:
  - status/进行中
  - type/笔记
  - 运维/Nginx
created: "2026-06-29 15:10"
updated: "2026-06-29 15:10"
source: "https://blog.csdn.net/qq_40374604/article/details/149459550"
知识体系: "DevOps/运维 → L3 编排与网关"
技术版本: "Nginx 1.24.x"
---

# Nginx HTTPS、性能优化与运维

## 📍 知识体系定位
- **所属技术栈**：DevOps / 运维
- **所在层级**：Nginx → 安全与运维层
- **上游依赖**：<a href="obsidian://open?file=反向代理与负载均衡">Nginx 反向代理与负载均衡</a>、<a href="obsidian://open?file=静态资源服务与虚拟主机">Nginx 静态资源服务</a>
- **同级技术**：Caddy（自动 HTTPS）、Cloudflare（CDN + SSL）

---

## 一、HTTPS 配置

### 为什么必须用 HTTPS？
- **安全**：防止中间人窃听（登录、支付等敏感操作）
- **浏览器信任**：HTTP 页面被 Chrome 标记"不安全"
- **SEO 权重**：Google 明确 HTTPS 是排名因素
- **生态要求**：微信、支付宝回调只支持 HTTPS

### 快速配置（Let's Encrypt + Certbot）

```bash
# ② 安装 Certbot（Ubuntu）
sudo apt install certbot python3-certbot-nginx -y

# ② 一键申请证书（自动修改 Nginx 配置）
sudo certbot --nginx
# ③ 自动配置 SSL 证书路径，支持 90 天自动续期
```

生成的配置效果：

```nginx
server {
    listen 443 ssl http2;                     # ② 开启 SSL + HTTP/2
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}

# ② HTTP 自动跳转 HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

### 自动续期验证

```bash
sudo certbot renew --dry-run    # ② 模拟续期，确认无误
sudo systemctl list-timers      # ② 检查 certbot 定时任务
```

---

## 二、性能优化

### gzip 压缩

```nginx
http {
    gzip on;
    gzip_types text/plain text/css application/json
               application/javascript text/xml;
    gzip_min_length 256;    # ② 小于 256 字节不压缩
    gzip_comp_level 5;      # ② 压缩级别 1-9（5 为平衡点）
}
```

### 静态资源缓存

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 30d;                        # ② 浏览器缓存 30 天
    add_header Cache-Control "public";
}
```

### Worker 与连接调优

```nginx
worker_processes auto;          # ② 自动匹配 CPU 核数
events {
    worker_connections 4096;    # ② 每个 worker 最大连接数
    use epoll;                  # ② Linux 下使用 epoll
}

http {
    sendfile on;                # ② 零拷贝发送文件
    tcp_nopush on;              # ② 减少网络包碎片
    tcp_nodelay on;             # ② 禁用 Nagle 算法（降低延迟）
    keepalive_timeout 65;       # ② 长连接超时
}
```

> **💡 补充**：`worker_processes auto` 让 Nginx 自动检测 CPU 核数并创建对应数量的 worker 进程，是生产环境的标准配置。

---

## 三、日志管理

### 访问日志（access.log）

```nginx
http {
    # ② 自定义日志格式
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent"';

    access_log /var/log/nginx/access.log main;
}
```

### 错误日志（error.log）

```nginx
error_log /var/log/nginx/error.log warn;  # ② 日志级别：debug/info/notice/warn/error/crit
```

### 日志分析工具

| 工具 | 适用场景 |
|------|---------|
| GoAccess | 命令行实时日志分析 |
| ELK（Elasticsearch + Logstash + Kibana） | 企业级集中式日志管理 |
| Grafana + Prometheus | Nginx 性能指标监控和可视化 |

---

## 四、实用技巧

### URL 重写（rewrite）

```nginx
# ② 旧链接跳转到新链接（SEO 友好）
rewrite ^/old-page$ /new-page permanent;

# ② 路径重写：去掉 /api 前缀
location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    rewrite ^/api/(.*)$ /$1 break;
}
```

### 防盗链

```nginx
location ~* \.(png|jpg|gif)$ {
    valid_referers none blocked example.com *.example.com;
    if ($invalid_referer) {
        return 403;
    }
}
```

### IP 访问控制

```nginx
location /admin/ {
    allow 192.168.1.0/24;   # ② 允许内网
    deny all;                # ② 拒绝其他
}
```

## 关联上下文
- **前置知识**：<a href="obsidian://open?file=反向代理与负载均衡">Nginx 反向代理与负载均衡</a> — HTTPS 终端通常与反向代理配合使用
- **前置知识**：<a href="obsidian://open?file=静态资源服务与虚拟主机">Nginx 静态资源服务</a> — gzip 压缩和缓存主要针对静态资源
- **实际应用**：<a href="obsidian://open?file=Nginx网关配置与SPA刷新问题">Nginx 网关部署</a> — 生产环境 Nginx 网关的完整配置（含 SSL + 代理 + SPA）
- **进阶方向**：OpenResty（Nginx + Lua 脚本，实现 API 网关、限流、鉴权等高级功能）

> 📂 所属：[[MOC - Nginx]]
