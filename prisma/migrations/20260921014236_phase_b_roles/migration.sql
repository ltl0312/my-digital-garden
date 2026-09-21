-- AlterTable
ALTER TABLE "AccessKey" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isBuiltin" BOOLEAN NOT NULL DEFAULT false;

-- 阶段 B 数据订正（spec 8.1）：存量首个 admin 密钥 = 内置唯一初始管理员
-- role 升级为独立值 root（保护位由 isBuiltin + 服务端二维校验承载）
-- 注意：只升「最早创建的一条」—— 若存在多条 admin，逐条 NOT EXISTS 在同一语句快照下
-- 会把多条全部升为 root（生产环境实际发生过，见 2026-09-21 部署记录）
UPDATE "AccessKey"
SET "role" = 'root', "isBuiltin" = true
WHERE "id" = (
  SELECT "id" FROM "AccessKey"
  WHERE "role" = 'admin'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "AccessKey" WHERE "role" = 'root');
