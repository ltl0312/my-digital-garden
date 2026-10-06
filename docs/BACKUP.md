# 备份策略

> 数据分层：**vault（Markdown 源文件）是唯一事实源**；PostgreSQL 是渲染缓存/图谱/搜索层，损坏时可从 vault 全量重建（开发模式 watcher 启动即全量重同步）。

## 必须备份：content/vault

服务器（或本地）定期打包 vault，并同步到**异地**（另一台机器 / 对象存储）。

```bash
# 服务器 cron：每天 03:00 打包并保留最近 7 份
0 3 * * * cd /opt/digital-garden && tar czf /var/backups/garden-vault-$(date +\%F).tar.gz content/vault && find /var/backups -name 'garden-vault-*' -mtime +7 -delete
```

异地同步（任选其一）：
- `rsync -avz /var/backups/ user@home:/backups/`（个人 NAS/电脑）
- 阿里云 OSS：`ossutil cp -r /var/backups oss://bucket/garden-backups/`（低频存储）

## 可选备份：PostgreSQL

DB 可重建，但为快速恢复（避免全量重解析耗时），可低频 `pg_dump`：

```bash
# 每周一次
PGPASSWORD='<从 .env 读取>' pg_dump -h 127.0.0.1 -U garden_user garden_db | gzip > /var/backups/garden-db-$(date +\%F).sql.gz
```

## 恢复演练（vault → DB 全量重建）

```bash
# 1. 恢复 vault 文件
tar xzf garden-vault-<日期>.tar.gz -C /opt/digital-garden/
# 2. 清空 DB（可选，幂等 upsert 会覆盖）
# 3. 触发全量重同步：开发模式重启应用（ignoreInitial=false 会全量处理）；
#    生产模式（ignoreInitial=true）需 touch 文件或临时删除再放回
```

## 注意

- 生产 watcher 配置为 `ignoreInitial: true` + 轮询，**重启不会自动全量重同步**（为避免刷新 updatedAt）。若 DB 丢失需要重建，应临时设置 `NODE_ENV=development` 重启一次，或对 vault 文件做一次批量 `touch`（注意这会更新文件的 mtime，但不影响 DB 的 updatedAt 判断——DB 中已无数据）。
- 密钥与 `.env`（DATABASE_URL / AUTH_SECRET）单独保管，不随备份包分发；必要时在恢复后重新配置。
