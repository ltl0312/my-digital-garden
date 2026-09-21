# 安全处置清单 · 生产数据库密码轮换

> 原因：旧生产密码曾硬编码在 `ecosystem.config.js` / `docker-compose.yml` 并进入 Git 历史（已从工作区清除）。
> 状态：✅ **已完成（2026-08-15 由 AI 会话远程执行）**。新密码已生效，应用已验证可用（verify 接口 200）。

---

## 完成记录

- [x] 前置检查：仓库无远端（`git remote -v` 无输出）
- [x] 数据库密码已轮换（`ALTER USER garden_user WITH PASSWORD '<新密码>'`，28 位随机字母数字）
- [x] `/opt/digital-garden/.env` 已更新（备份：`.env.bak-2026-08-15-2347`）
- [x] `/opt/digital-garden/ecosystem.config.cjs` 已更新（备份：`ecosystem.config.cjs.bak-2026-08-15-2347`）
- [x] 新密码落盘：`/root/.garden-db-password.txt`（权限 600，root 专属）
- [x] PM2 daemon 重启 + 重新加载配置 + `pm2 save` 持久化
- [x] 验证：`POST /api/auth/verify`（liutl → 200，错误密钥 → 401）、`GET /login` → 200
- [x] 本地临时密钥副本已全部删除；OneDrive 源私钥 ACL 已恢复原状

## 密码位置速查

| 位置 | 说明 |
|---|---|
| `/root/.garden-db-password.txt` | 服务器上密码唯一落盘处（root 600） |
| `/opt/digital-garden/.env` | 应用配置（DATABASE_URL 内含密码） |
| `/opt/digital-garden/ecosystem.config.cjs` | PM2 启动配置（DATABASE_URL 内含密码） |

> 本文件完成使命后可删除（`rm SECURITY-ACTIONS.md`）。
