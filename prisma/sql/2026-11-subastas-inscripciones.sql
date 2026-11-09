-- Subastas de creadores · Sección 2: inscripciones
ALTER TABLE "AuctionEdition" ADD COLUMN "registrationOpen" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AuctionRegistration" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "editionId" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tiktokUser" TEXT NOT NULL,
    "profileUrl" TEXT,
    "creatorAgency" TEXT NOT NULL,
    "photoUrl" TEXT,
    "bio" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "availability" TEXT NOT NULL,
    "canChangeName" BOOLEAN NOT NULL,
    "cameraMode" TEXT NOT NULL,
    "acceptedRules" BOOLEAN NOT NULL,
    "imageConsent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "responsibleId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuctionRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuctionRegistration_folio_key" ON "AuctionRegistration"("folio");
CREATE UNIQUE INDEX "AuctionRegistration_editionId_tiktokUser_key" ON "AuctionRegistration"("editionId", "tiktokUser");
CREATE INDEX "AuctionRegistration_agencySlug_editionId_status_idx" ON "AuctionRegistration"("agencySlug", "editionId", "status");
ALTER TABLE "AuctionRegistration" ENABLE ROW LEVEL SECURITY;
