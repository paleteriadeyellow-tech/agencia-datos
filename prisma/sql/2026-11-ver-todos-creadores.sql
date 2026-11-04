-- Permiso para que un manager vea todos los creadores de la agencia (lo da el admin en Managers)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canViewAll" BOOLEAN NOT NULL DEFAULT false;
