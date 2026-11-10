-- AlterTable
ALTER TABLE "Drill" ADD COLUMN "sampleVideoUrl" TEXT;

-- A sample clip link must use https. Prisma does not model this check.
ALTER TABLE "Drill" ADD CONSTRAINT "Drill_sampleVideoUrl_https"
  CHECK ("sampleVideoUrl" IS NULL OR "sampleVideoUrl" ~ '^https://');
