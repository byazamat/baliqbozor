-- CreateEnum
CREATE TYPE "ListingPauseReason" AS ENUM ('MANUAL', 'FRESHNESS', 'FARM_INACTIVE');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('ORG_VERIFICATION', 'FARM_PHOTO', 'LISTING_MEDIA');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "freshnessRemindedAt" TIMESTAMP(3),
ADD COLUMN     "pauseReason" "ListingPauseReason";

-- AlterTable
ALTER TABLE "MediaFile" ADD COLUMN     "purpose" "MediaPurpose",
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Farm_lat_lng_idx" ON "Farm"("lat", "lng");

-- CreateIndex
CREATE INDEX "Listing_status_lastConfirmedAt_idx" ON "Listing"("status", "lastConfirmedAt");

-- CreateIndex
CREATE INDEX "Listing_status_availableTo_idx" ON "Listing"("status", "availableTo");

-- CreateIndex
CREATE INDEX "MediaFile_orgId_purpose_idx" ON "MediaFile"("orgId", "purpose");

-- CreateIndex
CREATE INDEX "MediaFile_listingId_idx" ON "MediaFile"("listingId");

-- CreateIndex
CREATE INDEX "MediaFile_farmId_idx" ON "MediaFile"("farmId");

-- Файлы M1 — документы верификации (D-52).
UPDATE "MediaFile" SET "purpose" = 'ORG_VERIFICATION' WHERE "orgId" IS NOT NULL AND "purpose" IS NULL;
