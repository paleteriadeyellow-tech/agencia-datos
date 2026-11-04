-- CreateTable
CREATE TABLE "BonusLevelOverride" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "username" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "fromPeriod" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonusLevelOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BonusLevelOverride_agencySlug_username_key" ON "BonusLevelOverride"("agencySlug", "username");

