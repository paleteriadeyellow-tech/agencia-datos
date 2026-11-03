-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "evidenceAt" TIMESTAMP(3),
ADD COLUMN     "evidenceNote" TEXT,
ADD COLUMN     "evidencePath" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

