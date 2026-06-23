/*
  Warnings:

  - The values [PARTIAL] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `decimalPrecision` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `TradeedAt` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `isCancelled` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `tradedQuantity` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `makerfee` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `takerfee` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the `UserAssetBalance` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[baseAssetId,quoteAssetId,marketType]` on the table `Market` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[marketId,engineTradeId]` on the table `Trade` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `precision` to the `Asset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lotSize` to the `Market` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minNotional` to the `Market` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minQty` to the `Market` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tickSize` to the `Market` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entryPrice` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketType` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `Order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `side` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('SPOT', 'PERP');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('LIMIT', 'MARKET');

-- CreateEnum
CREATE TYPE "OrderPosition" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "FillStatus" AS ENUM ('TRADE', 'STP');

-- CreateEnum
CREATE TYPE "STPMode" AS ENUM ('CANCEL_MAKER', 'CANCEL_TAKER', 'CANCEL_BOTH');

-- CreateEnum
CREATE TYPE "TimeInForce" AS ENUM ('GTC', 'IOC', 'FOK');

-- CreateEnum
CREATE TYPE "AssetTransactionType" AS ENUM ('ON_RAMP', 'DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AssetTransactionStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('OPEN', 'PARTIAL_FILLED', 'PARTIAL_REJECTED', 'FILLED', 'CANCELLED', 'REJECTED');
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "UserAssetBalance" DROP CONSTRAINT "UserAssetBalance_assetId_fkey";

-- DropForeignKey
ALTER TABLE "UserAssetBalance" DROP CONSTRAINT "UserAssetBalance_userId_fkey";

-- DropIndex
DROP INDEX "Asset_name_key";

-- DropIndex
DROP INDEX "Market_baseAssetId_quoteAssetId_key";

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "decimalPrecision",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "precision" INTEGER NOT NULL,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "logo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "lotSize" TEXT NOT NULL,
ADD COLUMN     "marketType" "MarketType" NOT NULL DEFAULT 'SPOT',
ADD COLUMN     "maxLeverage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "minNotional" TEXT NOT NULL,
ADD COLUMN     "minQty" TEXT NOT NULL,
ADD COLUMN     "tickSize" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "TradeedAt",
DROP COLUMN "isCancelled",
DROP COLUMN "price",
DROP COLUMN "tradedQuantity",
ADD COLUMN     "averagePrice" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "entryPrice" TEXT NOT NULL,
ADD COLUMN     "filledAt" TIMESTAMP(3),
ADD COLUMN     "filledQuantity" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "leverage" INTEGER,
ADD COLUMN     "liquidation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "margin" TEXT,
ADD COLUMN     "marketType" "MarketType" NOT NULL,
ADD COLUMN     "position" "OrderPosition",
ADD COLUMN     "postOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduceOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stpMode" "STPMode" NOT NULL DEFAULT 'CANCEL_TAKER',
ADD COLUMN     "timeInForce" "TimeInForce" NOT NULL DEFAULT 'GTC',
DROP COLUMN "type",
ADD COLUMN     "type" "OrderType" NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE TEXT,
ALTER COLUMN "remainingQuantity" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "makerfee",
DROP COLUMN "takerfee",
ADD COLUMN     "engineTradeId" BIGINT,
ADD COLUMN     "makerFee" TEXT NOT NULL DEFAULT '0',
ADD COLUMN     "side" "TradeSide" NOT NULL,
ADD COLUMN     "status" "FillStatus" NOT NULL DEFAULT 'TRADE',
ADD COLUMN     "takerFee" TEXT NOT NULL DEFAULT '0',
ALTER COLUMN "price" SET DATA TYPE TEXT,
ALTER COLUMN "quantity" SET DATA TYPE TEXT;

-- DropTable
DROP TABLE "UserAssetBalance";

-- DropEnum
DROP TYPE "SpotOrderType";

-- CreateTable
CREATE TABLE "AssetTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "AssetTransactionType" NOT NULL,
    "status" "AssetTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" TEXT NOT NULL,
    "referenceId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AssetTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingSettlement" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "indexPrice" TEXT NOT NULL,
    "markPrice" TEXT NOT NULL,
    "intervalSeconds" INTEGER NOT NULL,
    "fundingRateBps" TEXT NOT NULL,
    "insuranceUsed" TEXT NOT NULL DEFAULT '0',
    "paymentsCount" INTEGER NOT NULL DEFAULT 0,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingPayment" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT,
    "marketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "fundingRateBps" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidationEvent" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "liquidatedUserId" TEXT NOT NULL,
    "liquidatorUserId" TEXT,
    "liquidationOrderId" TEXT,
    "indexPrice" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "bankruptcyPrice" TEXT,
    "liquidationPrice" TEXT,
    "insuranceUsed" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetTransaction_userId_createdAt_idx" ON "AssetTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetTransaction_assetId_createdAt_idx" ON "AssetTransaction"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetTransaction_type_status_idx" ON "AssetTransaction"("type", "status");

-- CreateIndex
CREATE INDEX "FundingSettlement_marketId_settledAt_idx" ON "FundingSettlement"("marketId", "settledAt");

-- CreateIndex
CREATE INDEX "FundingPayment_settlementId_idx" ON "FundingPayment"("settlementId");

-- CreateIndex
CREATE INDEX "FundingPayment_marketId_createdAt_idx" ON "FundingPayment"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "FundingPayment_userId_createdAt_idx" ON "FundingPayment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FundingPayment_positionId_idx" ON "FundingPayment"("positionId");

-- CreateIndex
CREATE INDEX "LiquidationEvent_marketId_createdAt_idx" ON "LiquidationEvent"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "LiquidationEvent_liquidatedUserId_createdAt_idx" ON "LiquidationEvent"("liquidatedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "LiquidationEvent_liquidatorUserId_createdAt_idx" ON "LiquidationEvent"("liquidatorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "LiquidationEvent_liquidationOrderId_idx" ON "LiquidationEvent"("liquidationOrderId");

-- CreateIndex
CREATE INDEX "Market_marketType_active_idx" ON "Market"("marketType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Market_baseAssetId_quoteAssetId_marketType_key" ON "Market"("baseAssetId", "quoteAssetId", "marketType");

-- CreateIndex
CREATE INDEX "Order_userId_marketId_idx" ON "Order"("userId", "marketId");

-- CreateIndex
CREATE INDEX "Order_status_marketId_idx" ON "Order"("status", "marketId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Trade_makerOrderId_idx" ON "Trade"("makerOrderId");

-- CreateIndex
CREATE INDEX "Trade_takerOrderId_idx" ON "Trade"("takerOrderId");

-- CreateIndex
CREATE INDEX "Trade_makerUserId_idx" ON "Trade"("makerUserId");

-- CreateIndex
CREATE INDEX "Trade_takerUserId_idx" ON "Trade"("takerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_marketId_engineTradeId_key" ON "Trade"("marketId", "engineTradeId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_makerUserId_fkey" FOREIGN KEY ("makerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_takerUserId_fkey" FOREIGN KEY ("takerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingSettlement" ADD CONSTRAINT "FundingSettlement_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingPayment" ADD CONSTRAINT "FundingPayment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "FundingSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingPayment" ADD CONSTRAINT "FundingPayment_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingPayment" ADD CONSTRAINT "FundingPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidationEvent" ADD CONSTRAINT "LiquidationEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidationEvent" ADD CONSTRAINT "LiquidationEvent_liquidatedUserId_fkey" FOREIGN KEY ("liquidatedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidationEvent" ADD CONSTRAINT "LiquidationEvent_liquidatorUserId_fkey" FOREIGN KEY ("liquidatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidationEvent" ADD CONSTRAINT "LiquidationEvent_liquidationOrderId_fkey" FOREIGN KEY ("liquidationOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
