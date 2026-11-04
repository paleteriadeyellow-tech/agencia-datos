-- AlterTable
ALTER TABLE "RecruitmentLead" ADD COLUMN     "extra" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "RecruitmentColumn" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "options" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecruitmentColumn_agencySlug_sortOrder_idx" ON "RecruitmentColumn"("agencySlug", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentColumn_agencySlug_key_key" ON "RecruitmentColumn"("agencySlug", "key");

