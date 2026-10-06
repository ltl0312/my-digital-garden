-- 标签 / 领域自动分配与人工审核（spec：自动化分配 + 用户审核通过才生效）
--
-- 手写而非 prisma migrate dev 生成（与本仓库 graph_colors / graph_color_rules 同一惯例）。
-- 变更内容：
--   ① Note 增加显式一级领域 domainLevel1 / domainSource —— 分配领域不再需要移动文件；
--   ② 新增 Suggestion 待审表 —— 自动判定结果先落这里，只有审核通过才写 Note 与 vault 文件。

-- ① 显式一级领域
ALTER TABLE "Note" ADD COLUMN "domainLevel1" TEXT;
ALTER TABLE "Note" ADD COLUMN "domainSource" TEXT NOT NULL DEFAULT 'auto';

-- 存量回填：能从 slug 解析出领域的笔记，视为「路径派生」，保持 domainSource='auto'、
-- domainLevel1 留空 —— 留空即代表走路径派生，语义上等同于旧行为，无需写值。
-- （若回填成具体值，用户以后移动文件时领域就不会跟着变了，反而背离旧语义。）
CREATE INDEX "Note_domainLevel1_idx" ON "Note"("domainLevel1");

-- ② 待审建议表
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "keepCurrentDir" BOOLEAN NOT NULL DEFAULT true,
    "domain" TEXT,
    "engine" TEXT NOT NULL DEFAULT 'rules',
    "rationale" JSONB NOT NULL DEFAULT '[]',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "appliedValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Suggestion_status_idx" ON "Suggestion"("status");
CREATE INDEX "Suggestion_noteId_idx" ON "Suggestion"("noteId");

ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 同一篇笔记同时只允许一条 pending（重复生成时先删旧 pending 再插，落库前再兜底）
CREATE UNIQUE INDEX "Suggestion_pending_per_note_idx"
    ON "Suggestion"("noteId") WHERE "status" = 'pending';
