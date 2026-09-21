-- AlterTable
ALTER TABLE "AccessKey" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isBuiltin" BOOLEAN NOT NULL DEFAULT false;

-- 阶段 B 数据订正（spec 8.1）：存量首个 admin 密钥 = 内置唯一初始管理员
-- role 升级为独立值 root（保护位由 isBuiltin + 服务端二维校验承载）
UPDATE "AccessKey"
SET "role" = 'root', "isBuiltin" = true
WHERE "role" = 'admin'
  AND NOT EXISTS (SELECT 1 FROM "AccessKey" WHERE "role" = 'root');
