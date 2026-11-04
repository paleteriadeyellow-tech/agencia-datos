-- CreateTable
CREATE TABLE "RecruitmentSettings" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "expiryMode" TEXT NOT NULL DEFAULT 'fixed',
    "validityDays" INTEGER NOT NULL DEFAULT 7,
    "soonDays" INTEGER NOT NULL DEFAULT 2,
    "messageKey" TEXT NOT NULL DEFAULT 'mensaje',
    "videoKey" TEXT NOT NULL DEFAULT 'comment',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitmentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecruitmentSettings_agencySlug_key" ON "RecruitmentSettings"("agencySlug");

