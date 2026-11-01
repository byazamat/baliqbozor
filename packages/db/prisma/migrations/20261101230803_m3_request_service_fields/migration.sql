-- AlterTable
ALTER TABLE "BuyerRequest" ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" UUID,
ADD COLUMN     "unmatchedTaskAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RequestNotification" ADD COLUMN     "invitedById" UUID;

-- CreateIndex
CREATE INDEX "BuyerRequest_status_expiresAt_idx" ON "BuyerRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Offer_status_validUntil_idx" ON "Offer"("status", "validUntil");
