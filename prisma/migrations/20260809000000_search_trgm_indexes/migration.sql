-- ============================================================
-- 笔记搜索索引：标题/正文 ILIKE %q% 使用 pg_trgm GIN 索引加速
-- 说明：pg_trgm 为 trusted extension（PG ≥ 13），数据库 owner 可直接创建；
--       若生产账号无权限导致 migrate deploy 失败，请以超级用户手动执行首行 SQL 后重跑。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Note_title_trgm_idx" ON "Note" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Note_content_trgm_idx" ON "Note" USING GIN ("content" gin_trgm_ops);
