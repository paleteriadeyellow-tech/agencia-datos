-- AlterTable
ALTER TABLE "User" ADD COLUMN     "position" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "genKey" TEXT,
ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "agencySlug" TEXT NOT NULL DEFAULT 'streamersfederation',
    "position" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'media',
    "recurrence" TEXT NOT NULL DEFAULT 'diaria',
    "weekdays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "dayOfMonth" INTEGER,
    "dueTime" TEXT,
    "evidenceHint" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTemplate_agencySlug_position_active_idx" ON "TaskTemplate"("agencySlug", "position", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplate_agencySlug_position_title_key" ON "TaskTemplate"("agencySlug", "position", "title");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Task_templateId_assigneeId_genKey_key" ON "Task"("templateId", "assigneeId", "genKey");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

