-- CreateTable
CREATE TABLE "BonusAward" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "period" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "creatorId" TEXT,
    "kind" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "usd" DOUBLE PRECISION,
    "advisory" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'calculado',
    "scheduledFor" TEXT,
    "method" TEXT,
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonusAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusWelcome" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "username" TEXT NOT NULL,
    "reward" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "BonusWelcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BonusAward_agencySlug_period_idx" ON "BonusAward"("agencySlug", "period");

-- CreateIndex
CREATE INDEX "BonusAward_agencySlug_status_idx" ON "BonusAward"("agencySlug", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BonusAward_agencySlug_period_username_kind_key" ON "BonusAward"("agencySlug", "period", "username", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BonusWelcome_agencySlug_username_key" ON "BonusWelcome"("agencySlug", "username");

