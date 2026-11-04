-- Reglas del seguimiento de reclutamiento. Se puede ejecutar aunque ya hayas corrido la versión anterior.
CREATE TABLE IF NOT EXISTS "RecruitmentSettings" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "expiryMode" TEXT NOT NULL DEFAULT 'fixed',
    "validityDays" INTEGER NOT NULL DEFAULT 7,
    "soonDays" INTEGER NOT NULL DEFAULT 2,
    "requiredKeys" TEXT NOT NULL DEFAULT 'atendio,situation,seEnvioInvitacion,mensaje,comment,phone,visitarLive,integracion,mensajeAceptacion,mensajeImagen,comment2,integrationDate',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecruitmentSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RecruitmentSettings" ADD COLUMN IF NOT EXISTS "requiredKeys" TEXT NOT NULL DEFAULT 'atendio,situation,seEnvioInvitacion,mensaje,comment,phone,visitarLive,integracion,mensajeAceptacion,mensajeImagen,comment2,integrationDate';

CREATE UNIQUE INDEX IF NOT EXISTS "RecruitmentSettings_agencySlug_key" ON "RecruitmentSettings"("agencySlug");
