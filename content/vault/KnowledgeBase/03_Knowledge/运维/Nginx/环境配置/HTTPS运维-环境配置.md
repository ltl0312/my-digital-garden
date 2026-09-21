---
aliases: [Nginx HTTPS 配置, Nginx SSL 配置, Certbot 配置, Nginx 性能配置]
maturity: SEEDLING
tags:
  - status/进行中
  - type/教程
  - 运维/Nginx
created: "2026-06-29 15:10"
updated: "2026-06-29 15:10"
source: "https://nginx.org/en/docs/http/configuring_https_servers.html"
知识体系: "DevOps/运维 → L3 编排与网关"
技术版本: "Nginx 1.24.x"
---

# Nginx — HTTPS、性能调优与运维配置指南

> 基础安装请参考 <a href="obsidian://open?file=环境配置与项目初始化">Nginx 环境配置与安装</a>。

## Step 1: HTTPS 配置（Let's Encrypt 免费证书）

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx           # ② 自动配置 + 自动续期
sudo certbot renew --dry-run   # ② 测试续期
```

```nginx
# ② 自动生成的效果
server {
    listen 443 ssl http2;
    server_name example.com;
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
}

# ② HTTP 强制跳转 HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

## Step 2: gzip 压缩

```nginx
http {
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;
    gzip_comp_level 5;         # ② 1-9，5 是性能和压缩率的平衡点
}
```

## Step 3: 静态资源缓存

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

## Step 4: Worker 性能调优

```nginx
worker_processes auto;          # ② 自动匹配 CPU 核数
worker_connections 4096;        # ② 高并发场景调大
sendfile on;                    # ② 零拷贝
tcp_nopush on;
tcp_nodelay on;
keepalive_timeout 65;
```

## Step 5: 日志配置

```nginx
http {
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent"';
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;
}
```

## 常用运维命令速查

```bash
nginx -t                    # 检查配置
nginx -s reload             # 热重载
tail -f /var/log/nginx/access.log   # 实时查看访问日志
tail -f /var/log/nginx/error.log    # 实时查看错误日志
```

## 常见问题

| 问题 | 解决 |
|------|------|
| 443 端口访问不到 | 云安全组放行 TCP 443 |
| Certbot 申请失败 | 域名必须已解析到服务器 IP |
| 证书续期失败 | 确保 `.well-known/acme-challenge` 路径可访问 |

> 📂 所属：[[MOC - Nginx]]
