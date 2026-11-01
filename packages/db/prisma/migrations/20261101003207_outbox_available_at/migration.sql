-- AlterTable
ALTER TABLE "DomainEvent" ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "DomainEvent_processedAt_availableAt_idx" ON "DomainEvent"("processedAt", "availableAt");
