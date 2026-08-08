---
aliases: [JWT鉴权, JSON Web Token, 无状态认证, Token安全, 拦截器]
tags:
  - status/进行中
  - type/笔记
  - Java/安全
created: "2026-06-16 12:30"
updated: "2026-06-16 15:00"
source: "00_Inbox/Java全栈开发实战笔记(SpringBoot+Vue3).md"
知识体系: "Java 后端 → L4 安全层"
技术版本: "Spring Boot 3.x / Java 17"
---

# JWT 无状态鉴权与安全机制

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L4 安全层
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> JWT（JSON Web Token）用三段式结构（Header.Payload.Signature）实现无状态身份认证——服务器不存 Session，全靠签名防伪。只要密钥不泄露，任何人都无法伪造 Token。

---

## 一、JWT 三段式解剖

```
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEwMDF9.BW5hYc8xlxJqjZ7KLYWqkAzCvVjH_GBdrZK8f3x_Y8s

  ┌────── Header ──────┐  ┌────── Payload ────────┐  ┌────── Signature ────────────────────────┐
  │ eyJhbGciOiJIUzI1   │  │ eyJ1c2VySWQiOjEwMDF9 │  │ BW5hYc8xlxJqjZ7KLYWqkAzCvVjH_GBdrZK8f3│
  │ NiJ9               │  │                      │  │ x_Y8s                                  │
  └────────────────────┘  └──────────────────────┘  └────────────────────────────────────────┘
  
Base64 解码 ↓                 Base64 解码 ↓
{"alg":"HS256","typ":"JWT"}  {"userId":1001,"exp":1700000000}
                                     ↑
                          ⚠️ 这是明文！绝不能放密码！
```

### 签名（Signature）如何防伪？

```
Signature = HMAC-SHA256(
    Base64(Header) + "." + Base64(Payload),  ← 前两部分
    "your-256-bit-secret"                    ← 只有服务器知道的密钥
)

黑客的篡改困境：
  ① 把 Payload 里的 userId=1001 改成 userId=9999
  ② 需要重新生成匹配的 Signature
  ③ 但他不知道 Secret 密钥 → 无法生成有效签名
  ④ 服务器一验签：收到的 Signature ≠ 用 Secret 计算出的签名 → 401！
```

---

## 二、JWT 完整生命周期

```
        ┌──────────────────────────────────────────────────────────┐
        │                        客户端                              │
        │  ① 用户名+密码 POST /login                                 │
        │  ⑥ 收到 Token，存 Pinia + localStorage                    │
        │  ⑦ 每次请求在 Header 携带：Authorization: Bearer <Token>  │
        └────────┬─────────────────────────────────────┬───────────┘
                 │ ①                                   │ ⑦
        ┌────────▼─────────────────────────────────────▼───────────┐
        │                        服务端                              │
        │  ② 校验密码 (BCrypt)                                      │
        │  ③ 生成 JWT (挂载 userId + exp 过期时间)                   │
        │  ④ 返回 Token 给客户端                                    │
        │  ⑧ 拦截器提取 Header 中的 Token                            │
        │  ⑨ 验签 + 解析 userId                                     │
        │  ⑩ 将 userId 放入 Request 作用域，业务层直接取用          │
        └──────────────────────────────────────────────────────────┘
```

---

## 三、后端关键代码

### 生成 JWT
```java
public class JwtUtils {
    private static final String SECRET = "your-256-bit-secret-min-32-chars!!";  // 生产环境放配置中心！
    private static final long EXPIRATION = 7200 * 1000;  // 2小时

    public static String generateToken(Long userId) {
        return Jwts.builder()
                .setSubject(String.valueOf(userId))
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + EXPIRATION))
                .signWith(Keys.hmacShaKeyFor(SECRET.getBytes()), SignatureAlgorithm.HS256)
                .compact();
    }

    public static Long getUserIdFromToken(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(SECRET.getBytes())
                .build()
                .parseClaimsJws(token)
                .getBody();
        return Long.valueOf(claims.getSubject());
    }
}
```

### JWT 拦截器
```java
@Component
public class JwtInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // ① 放行 OPTIONS 预检请求（CORS 血泪教训！）
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        // ② 提取 Token
        String token = request.getHeader("Authorization");
        if (token == null || !token.startsWith("Bearer ")) {
            throw new UnauthorizedException("未登录");
        }
        token = token.substring(7);  // 去掉 "Bearer " 前缀

        // ③ 验签 + 解析
        try {
            Long userId = JwtUtils.getUserIdFromToken(token);
            SecurityContextHolder.set(userId);  // 放入上下文
            return true;
        } catch (ExpiredJwtException e) {
            throw new UnauthorizedException("Token 已过期");
        } catch (JwtException e) {
            throw new UnauthorizedException("Token 无效");
        }
    }
}
```

---

## 四、JWT vs Session 对比

| 维度 | Session（有状态） | JWT（无状态） |
|------|------------------|---------------|
| 存储位置 | 服务器内存/Redis | 客户端 |
| 扩展性 | 分布式需 Session 共享 | ⭐⭐⭐⭐⭐ 天然支持 |
| 安全性 | Cookie + SessionID | 签名防伪 |
| 灵活性 | 只能 Web Cookie | Web + App + 微服务 |
| 注销 | 直接删除 Session | 较麻烦（需黑名单或短 TTL） |

### JWT 最佳实践

| 实践 | 说明 |
|------|------|
| **Payload 不放敏感数据** | Payload 是 Base64 编码（非加密），任何人都可以解码 |
| **Secret 密钥足够长** | 至少 256 bit（32 字符），放配置中心而非代码硬编码 |
| **TTL 不宜过长** | 建议 2 小时，配合 Refresh Token 实现长期登录 |
| **HTTPS 传输** | 防止 Token 在网络中被窃取 |
| **黑名单机制** | 需要立即注销场景（如封号），Redis 维护短期黑名单 |

---

## 关联上下文
- **Spring MVC 拦截器**：JwtInterceptor 是 Spring MVC 请求流水线第④步的核心组件，详见 <a href="obsidian://open?file=自动装配原理与MVC生命周期">SpringBoot3-自动装配原理与MVC生命周期</a>
- **Redis 存储**：短期黑名单 Token 用 Redis String 存储（TTL 自动过期），详见 <a href="obsidian://open?file=Redis-高性能原理与数据结构">Redis-高性能原理与数据结构</a>
- **CORS 预检**：OPTIONS 请求的拦截器放行是 JWT + CORS 联合调试的关键，详见 CORS跨域与数据库连接池避坑（📋 待补充）
- **前置知识**：📋 待补充：HTTP无状态协议基础 — 理解为什么需要鉴权机制
- **横向对比**：📋 待补充：Session vs JWT对比 — 有状态 vs 无状态鉴权选型理由
- **实际应用**：📋 待补充：微服务网关统一鉴权 — 单点登录与API网关落地场景
- **进阶方向**：📋 待补充：OAuth2与SSO — 企业级授权协议及单点登录
- **易混淆概念**：📋 待补充：Token vs Session vs API Key — 三者的区别与适用场景

> 📂 所属：[[MOC - SpringBoot]]
