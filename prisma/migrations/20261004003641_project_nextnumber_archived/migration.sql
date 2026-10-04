-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "nextNumber" INTEGER NOT NULL DEFAULT 1;
