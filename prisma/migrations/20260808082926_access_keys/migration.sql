-- CreateTable
CREATE TABLE "AccessKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessKey_key_key" ON "AccessKey"("key");

-- CreateIndex
CREATE INDEX "AccessKey_isActive_idx" ON "AccessKey"("isActive");
