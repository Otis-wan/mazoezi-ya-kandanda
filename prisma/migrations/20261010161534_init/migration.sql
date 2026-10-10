-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DF', 'MF', 'FW');

-- CreateEnum
CREATE TYPE "DrillPosition" AS ENUM ('GK', 'DF', 'MF', 'FW', 'ALL');

-- CreateEnum
CREATE TYPE "AgeBand" AS ENUM ('AGE_13_14', 'AGE_15_16', 'AGE_17_19');

-- CreateEnum
CREATE TYPE "DrillFormat" AS ENUM ('INDIVIDUAL', 'PAIRS', 'SMALL_GROUP', 'GROUP');

-- CreateEnum
CREATE TYPE "Intensity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DrillCategory" AS ENUM ('BALL_MASTERY', 'PASSING', 'DRIBBLING', 'SHOOTING', 'HEADING', 'DEFENDING', 'TACTICAL', 'GOALKEEPING', 'SET_PIECES', 'PHYSICAL', 'PSYCHOLOGICAL');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('COACH', 'TEAM_MANAGER');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('ONCE', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('COACH', 'SELF');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ageBand" "AgeBand" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamStaff" (
    "teamId" TEXT NOT NULL,
    "staffExternalId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,

    CONSTRAINT "TeamStaff_pkey" PRIMARY KEY ("teamId","staffExternalId")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userExternalId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthYear" INTEGER NOT NULL,
    "position" "Position",
    "teamId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DrillCategory" NOT NULL,
    "subcategory" TEXT NOT NULL,
    "format" "DrillFormat" NOT NULL,
    "ageBands" "AgeBand"[],
    "positions" "DrillPosition"[],
    "durationMin" INTEGER NOT NULL,
    "intensity" "Intensity" NOT NULL,
    "equipment" TEXT[],
    "description" TEXT NOT NULL,
    "coachingPoints" TEXT[],
    "rubric" JSONB NOT NULL,
    "progression" TEXT,
    "videoNote" TEXT,
    "safetyNote" TEXT,

    CONSTRAINT "Drill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "createdByExternalId" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineDrill" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "drillId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RoutineDrill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "coachExternalId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'ONCE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selfFeedback" TEXT,
    "videoPlaybackId" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "reviewerExternalId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" TEXT,
    "videoPlaybackId" TEXT,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEntry" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "drillId" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "source" "ScoreSource" NOT NULL,
    "authorExternalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_externalId_key" ON "Team"("externalId");

-- CreateIndex
CREATE INDEX "TeamStaff_staffExternalId_idx" ON "TeamStaff"("staffExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_externalId_key" ON "Player"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userExternalId_key" ON "Player"("userExternalId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Drill_category_idx" ON "Drill"("category");

-- CreateIndex
CREATE INDEX "RoutineDrill_drillId_idx" ON "RoutineDrill"("drillId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineDrill_routineId_order_key" ON "RoutineDrill"("routineId", "order");

-- CreateIndex
CREATE INDEX "Assignment_playerId_status_idx" ON "Assignment"("playerId", "status");

-- CreateIndex
CREATE INDEX "Assignment_status_dueAt_idx" ON "Assignment"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Assignment_routineId_idx" ON "Assignment"("routineId");

-- CreateIndex
CREATE INDEX "Assignment_coachExternalId_idx" ON "Assignment"("coachExternalId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_key" ON "Submission"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_assignmentId_key" ON "Review"("assignmentId");

-- CreateIndex
CREATE INDEX "ScoreEntry_drillId_idx" ON "ScoreEntry"("drillId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreEntry_assignmentId_drillId_criterion_source_key" ON "ScoreEntry"("assignmentId", "drillId", "criterion", "source");

-- AddForeignKey
ALTER TABLE "TeamStaff" ADD CONSTRAINT "TeamStaff_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineDrill" ADD CONSTRAINT "RoutineDrill_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineDrill" ADD CONSTRAINT "RoutineDrill_drillId_fkey" FOREIGN KEY ("drillId") REFERENCES "Drill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_drillId_fkey" FOREIGN KEY ("drillId") REFERENCES "Drill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ScoreEntry score range constraint
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_score_range" CHECK ("score" BETWEEN 1 AND 5);