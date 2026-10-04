-- ============================================================
-- 图谱颜色规则：按访问密钥（用户身份）隔离，一行一份**有序**规则表。
-- 数组顺序即优先级，所以用 jsonb 单行整体替换，而不是多行表 + 排序列。
-- 手写而非 prisma migrate dev 生成：本地库的 20260921014236_phase_b_roles
-- 在应用后又被订正过，migrate dev 的 drift 检测会要求 reset 整个 dev 库。
-- ============================================================

-- CreateTable
CREATE TABLE "GraphColorRules" (
    "keyId" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphColorRules_pkey" PRIMARY KEY ("keyId")
);

-- AddForeignKey
ALTER TABLE "GraphColorRules" ADD CONSTRAINT "GraphColorRules_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "AccessKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
