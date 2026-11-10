-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "seriesId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_seriesId_dueAt_key" ON "Assignment"("seriesId", "dueAt");
