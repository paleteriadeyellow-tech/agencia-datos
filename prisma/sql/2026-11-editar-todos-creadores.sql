-- Permiso para que un manager también cree, edite y elimine a cualquier creador (lo da el admin en Managers)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canViewAll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canEditAll" BOOLEAN NOT NULL DEFAULT false;
