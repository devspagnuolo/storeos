-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "businessProfile" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "verificationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "verificationHash" TEXT;

