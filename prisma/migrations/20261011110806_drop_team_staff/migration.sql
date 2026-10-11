/*
  Warnings:

  - You are about to drop the `TeamStaff` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TeamStaff" DROP CONSTRAINT "TeamStaff_teamId_fkey";

-- DropTable
DROP TABLE "TeamStaff";

-- DropEnum
DROP TYPE "StaffRole";
