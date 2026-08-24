-- CreateEnum
CREATE TYPE "MeterStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RelayState" AS ENUM ('ON', 'OFF', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RelayAction" AS ENUM ('TRIP', 'CLOSE');

-- CreateEnum
CREATE TYPE "RelayTrigger" AS ENUM ('BALANCE_DEPLETED_METER', 'BALANCE_DEPLETED_SERVER', 'TOPUP_RECONNECT', 'MANUAL_PROVIDER', 'MANUAL_ADMIN');

-- CreateEnum
CREATE TYPE "MeterEventType" AS ENUM ('CONNECTED', 'DISCONNECTED', 'LOGIN', 'HEARTBEAT', 'ENERGY_REPORT', 'RELAY_COMMAND_SENT', 'RELAY_COMMAND_ACK', 'RELAY_COMMAND_FAILED');

-- CreateTable
CREATE TABLE "Meter" (
    "id" TEXT NOT NULL,
    "meterAddr" TEXT NOT NULL,
    "serial" TEXT,
    "imei" TEXT,
    "iccid" TEXT,
    "softVer" TEXT,
    "providerId" TEXT,
    "consumerId" TEXT,
    "status" "MeterStatus" NOT NULL DEFAULT 'UNKNOWN',
    "relayState" "RelayState" NOT NULL DEFAULT 'UNKNOWN',
    "pricePerKwh" DECIMAL(10,6),
    "lastSeen" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "voltageA" DECIMAL(8,2) NOT NULL,
    "currentA" DECIMAL(8,3) NOT NULL,
    "activePower" DECIMAL(10,2) NOT NULL,
    "totalEnergy" DECIMAL(12,4) NOT NULL,
    "remainingKwh" DECIMAL(12,4) NOT NULL,
    "relayState" "RelayState" NOT NULL,
    "signal" INTEGER NOT NULL,
    "rawFrame" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelayEvent" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "action" "RelayAction" NOT NULL,
    "trigger" "RelayTrigger" NOT NULL,
    "initiatedByUserId" TEXT,
    "commandSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterEvent" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "type" "MeterEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Meter_meterAddr_key" ON "Meter"("meterAddr");

-- CreateIndex
CREATE UNIQUE INDEX "Meter_serial_key" ON "Meter"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "Meter_imei_key" ON "Meter"("imei");

-- CreateIndex
CREATE INDEX "Meter_providerId_idx" ON "Meter"("providerId");

-- CreateIndex
CREATE INDEX "Meter_consumerId_idx" ON "Meter"("consumerId");

-- CreateIndex
CREATE INDEX "MeterReading_meterId_idx" ON "MeterReading"("meterId");

-- CreateIndex
CREATE INDEX "MeterReading_readAt_idx" ON "MeterReading"("readAt");

-- CreateIndex
CREATE INDEX "RelayEvent_meterId_idx" ON "RelayEvent"("meterId");

-- CreateIndex
CREATE INDEX "MeterEvent_meterId_idx" ON "MeterEvent"("meterId");

-- CreateIndex
CREATE INDEX "MeterEvent_createdAt_idx" ON "MeterEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelayEvent" ADD CONSTRAINT "RelayEvent_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelayEvent" ADD CONSTRAINT "RelayEvent_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterEvent" ADD CONSTRAINT "MeterEvent_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
