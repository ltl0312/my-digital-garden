-- CreateEnum
CREATE TYPE "Maturity" AS ENUM ('SEEDLING', 'GROWING', 'EVERGREEN');

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "summary" TEXT,
    "maturity" "Maturity" NOT NULL DEFAULT 'SEEDLING',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "readingTime" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteTag" (
    "noteId" TEXT NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "NoteTag_pkey" PRIMARY KEY ("noteId","tagId")
);

-- CreateTable
CREATE TABLE "NoteLink" (
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "NoteLink_pkey" PRIMARY KEY ("sourceId","targetId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Note_slug_key" ON "Note"("slug");

-- CreateIndex
CREATE INDEX "Note_slug_idx" ON "Note"("slug");

-- CreateIndex
CREATE INDEX "Note_isPublished_idx" ON "Note"("isPublished");

-- CreateIndex
CREATE INDEX "Note_maturity_idx" ON "Note"("maturity");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- AddForeignKey
ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
