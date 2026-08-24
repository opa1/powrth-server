-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT_LOAD', 'PROVIDER_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "EnergyBalance" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "kwhBalance" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "usdcLoaded" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "kwhConsumed" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "lastTotalEnergyKwh" DECIMAL(12,4),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "loadedByUserId" TEXT,
    "meterId" TEXT,
    "usdcAmount" DECIMAL(18,6) NOT NULL,
    "platformFee" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "platformFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "providerEarning" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "kwhAmount" DECIMAL(12,4),
    "pricePerKwhUsed" DECIMAL(10,6),
    "solanaSignature" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "feeRatePercent" DECIMAL(6,4) NOT NULL DEFAULT 0.02,
    "minCreditLoadUsdc" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    "minWithdrawalUsdc" DECIMAL(10,2) NOT NULL DEFAULT 5.00,
    "feeWalletAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnergyBalance_meterId_key" ON "EnergyBalance"("meterId");

-- CreateIndex
CREATE UNIQUE INDEX "EnergyBalance_consumerId_meterId_key" ON "EnergyBalance"("consumerId", "meterId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_solanaSignature_key" ON "Transaction"("solanaSignature");

-- CreateIndex
CREATE INDEX "Transaction_meterId_idx" ON "Transaction"("meterId");

-- CreateIndex
CREATE INDEX "Transaction_loadedByUserId_idx" ON "Transaction"("loadedByUserId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- AddForeignKey
ALTER TABLE "EnergyBalance" ADD CONSTRAINT "EnergyBalance_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnergyBalance" ADD CONSTRAINT "EnergyBalance_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loadedByUserId_fkey" FOREIGN KEY ("loadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
