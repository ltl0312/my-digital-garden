-- 应用级设置表（键值 + jsonb）——承载「AI 增强」的 GUI 可配项
--
-- 手写而非 prisma migrate dev 生成（与本仓库 graph_colors / tag_domain_suggestions 同一惯例）。
-- 纯新增表，无数据订正；回滚旧版本时该表被保留但旧代码不读，无副作用。

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
