-- Subastas de creadores · Sección 3: tareas generadas por edición (columnas nuevas y opcionales en Task)
ALTER TABLE "Task" ADD COLUMN "auctionEditionId" TEXT;
ALTER TABLE "Task" ADD COLUMN "auctionKey" TEXT;
CREATE UNIQUE INDEX "Task_auctionEditionId_auctionKey_key" ON "Task"("auctionEditionId", "auctionKey");
CREATE INDEX "Task_auctionEditionId_idx" ON "Task"("auctionEditionId");
