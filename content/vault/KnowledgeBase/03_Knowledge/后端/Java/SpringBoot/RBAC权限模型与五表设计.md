---
aliases: [RBAC权限模型, 五表设计, 角色权限, 动态路由, 权限标识]
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

# RBAC 权限模型与五表设计

## 📍 知识体系定位
（严格按 03_Knowledge/技术划分.md 填写）
- **所属技术栈**：Java 后端
- **所在层级**：Java 后端 → L4 安全层
- **上游依赖**：（根据该技术在技术划分中的层级，列出上一层必须掌握的前置知识）
- **下游延伸**：（列出下一层可以学习的进阶技术）
- **同级技术**：（同层级解决同类问题的其他技术）

## 核心概念
> RBAC（Role-Based Access Control）通过"用户 ↔ 角色 ↔ 菜单/按钮"的三层解耦，解决了大规模系统权限分配的复杂性——用户不直接拥有权限，而是通过角色获得权限集合。

---

## 一、RBAC 五表 ER 图

```
  ┌───────────────┐         ┌───────────────────┐         ┌───────────────┐
  │   sys_user    │         │   sys_user_role    │         │   sys_role    │
  ├───────────────┤         ├───────────────────┤         ├───────────────┤
  │ id PK         │ 1 ─── N │ user_id FK        │ N ─── 1 │ id PK         │
  │ username      │         │ role_id FK        │         │ role_name     │
  │ password      │         └───────────────────┘         │ role_code     │
  │ email         │                                       │ status        │
  │ status        │                                       └───────┬───────┘
  └───────────────┘                                               │ N
                                                                  │
                                                   ┌──────────────┴───────────┐
                                                   │   sys_role_menu          │
                                                   ├──────────────────────────┤
                                                   │ role_id FK               │
                                                   │ menu_id FK               │
                                                   └──────────────┬───────────┘
                                                                  │ N
                                                                  │
                                                   ┌──────────────┴───────────┐
                                                   │   sys_menu               │
                                                   ├───────────────────────────┤
                                                   │ id PK                    │
                                                   │ parent_id   (自关联)      │
                                                   │ menu_name   "用户管理"    │
                                                   │ path        "/system/user" │
                                                   │ component   "system/user"  │
                                                   │ perms       "system:user:list" │
                                                   │ menu_type   M/C/F         │
                                                   │ icon        "user"         │
                                                   │ order_num   排序号         │
                                                   └───────────────────────────┘

M = 目录 (Directory)
C = 菜单 (Menu)  
F = 按钮 (Button/Function)
```

### 五表职责

| 表 | 核心字段 | 职责 |
|----|----------|------|
| `sys_user` | id, username, password(BCrypt) | 存储用户账户 |
| `sys_role` | id, role_name, role_code, status | 定义角色（如财务总监） |
| `sys_menu` | id, parent_id, path, component, perms, menu_type | 树形菜单+按钮权限标识 |
| `sys_user_role` | user_id, role_id | 用户↔角色 多对多关联 |
| `sys_role_menu` | role_id, menu_id | 角色↔菜单 多对多关联 |

---

## 二、权限流转全景

```
① 管理员配置
   给"财务总监"角色勾选菜单：
     └─ 财务管理（目录 M）
        ├─ 财务报表（菜单 C）→ 路由 /finance/report，组件 finance/report.vue
        │   ├─ 导出报表（按钮 F）→ 权限标识 finance:report:export
        │   └─ 打印报表（按钮 F）→ 权限标识 finance:report:print

② 用户登录后
   张三 → sys_user_role → 财务总监 → sys_role_menu → 权限标识列表：
   ["finance:report:export", "finance:report:print"]

③ 后端返回权限树
   GET /api/getRouters → 根据 userId → 查 user → role → menu → 
   返回树形 JSON：[{
     path: '/finance',
     children: [{
       path: 'report',
       component: 'finance/report',
       meta: { perms: ['finance:report:export', 'finance:report:print'] }
     }]
   }]

④ 前端动态渲染
   - 递归组装 JSON → router.addRoute() → 动态注入路由表
   - 侧边栏读取路由表 → 渲染菜单
   - <button v-hasPermi="['finance:report:export']">导出</button>
```

---

## 三、后端权限校验代码骨架

```java
// 自定义权限注解
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresPermission {
    String value();  // 权限标识，如 "finance:report:export"
}

// AOP 切面拦截
@Aspect
@Component
public class PermissionAspect {
    @Around("@annotation(requiresPermission)")
    public Object checkPermission(ProceedingJoinPoint pjp, 
                                   RequiresPermission requiresPermission) throws Throwable {
        // ① 从 SecurityContext 获取当前用户
        Long userId = SecurityUtils.getCurrentUserId();
        // ② 查 Redis 缓存 → MySQL 获取用户权限标识集合
        Set<String> permissions = permissionService.getPermissionsByUserId(userId);
        // ③ 判断是否包含所需权限
        if (!permissions.contains(requiresPermission.value())) {
            throw new ForbiddenException("无访问权限");
        }
        return pjp.proceed();
    }
}

// Controller 中使用
@RequiresPermission("finance:report:export")
@PostMapping("/report/export")
public Result<?> exportReport() { ... }
```

---

## 四、前端自定义指令 v-hasPermi

```typescript
// directives/permission.ts
import { useUserStore } from '@/stores/user';

export const hasPermi = {
    mounted(el: HTMLElement, binding: DirectiveBinding) {
        const { value } = binding;  // ['finance:report:export']
        const permissions = useUserStore().permissions;

        if (value && value instanceof Array && value.length > 0) {
            const hasPermission = permissions.some(perm => value.includes(perm));
            if (!hasPermission) {
                el.parentNode?.removeChild(el);  // 无权限：直接移除 DOM
            }
        }
    }
};

// 使用
<el-button v-has-permi="['finance:report:export']" @click="exportExcel">
    导出报表
</el-button>
```

---

## 关联上下文
- **横向对比**：📋 待补充：ABAC与RBAC对比 ABAC（基于属性）更灵活但实现复杂，RBAC 更直观且适合绝大多数企业级系统，详见 📋 待补充：权限模型选型
- **实际应用**：📋 待补充：动态路由权限控制 前端根据 RBAC 权限树动态 `addRoute`，配合路由守卫实现访问控制
- **进阶方向**：📋 待补充：Redis缓存权限树优化 用户权限树首次查 MySQL 后缓存到 Redis Hash，避免每次请求都查数据库，详见 <a href="obsidian://open?file=Redis-高性能原理与数据结构">Redis-高性能原理与数据结构</a>
- **易混淆概念**：📋 待补充：权限标识与角色 权限标识（Permission Flag）是针对具体操作的细粒度控制，角色（Role）是权限标识的集合，两者是聚合关系而非竞争关系

> 📂 所属：[[MOC - SpringBoot]]
