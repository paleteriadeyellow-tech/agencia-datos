-- Subastas de creadores · Sección 1: calendario de ediciones
CREATE TABLE "AuctionEdition" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "number" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL DEFAULT '20:00',
    "host" TEXT NOT NULL DEFAULT 'Majo',
    "status" TEXT NOT NULL DEFAULT 'programada',
    "dateConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuctionEdition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuctionEdition_agencySlug_number_key" ON "AuctionEdition"("agencySlug", "number");
CREATE INDEX "AuctionEdition_agencySlug_date_idx" ON "AuctionEdition"("agencySlug", "date");
-- Seguridad: la app accede con Prisma (servidor); se bloquea el acceso directo por la API pública de Supabase.
ALTER TABLE "AuctionEdition" ENABLE ROW LEVEL SECURITY;
