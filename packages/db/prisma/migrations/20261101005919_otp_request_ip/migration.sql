-- AlterTable
ALTER TABLE "OtpCode" ADD COLUMN     "ip" TEXT;

-- CreateIndex
CREATE INDEX "OtpCode_ip_createdAt_idx" ON "OtpCode"("ip", "createdAt");
