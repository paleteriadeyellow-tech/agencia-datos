-- Color del encabezado de cada columna de la hoja de reclutamiento
ALTER TABLE "RecruitmentColumn" ADD COLUMN IF NOT EXISTS "color" TEXT;
