-- ============================================================
-- 图谱节点自定义颜色：按访问密钥（用户身份）隔离的服务端存储。
-- 键用 slug（vault 相对路径）而不是 Note.id —— Note.id 是重建库时会变的 uuid，
-- slug 才是笔记在图谱里的稳定身份。
-- 手写而非 prisma migrate dev 生成：本地库的 20260921014236_phase_b_roles
-- 在应用后又被订正过，migrate dev 的 drift 检测会要求 reset 整个 dev 库。
-- ============================================================

-- CreateTable
CREATE TABLE "GraphColor" (
    "keyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphColor_pkey" PRIMARY KEY ("keyId","slug")
);

-- CreateIndex
CREATE INDEX "GraphColor_keyId_idx" ON "GraphColor"("keyId");

-- AddForeignKey
ALTER TABLE "GraphColor" ADD CONSTRAINT "GraphColor_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "AccessKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
