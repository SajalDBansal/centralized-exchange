-- TimescaleDB is required for hypertable conversion. Local dev should use a
-- TimescaleDB-enabled Postgres image before this migration is applied.
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- CreateTable
CREATE TABLE "MarketTicker" (
    "marketId" TEXT NOT NULL,
    "lastPrice" TEXT NOT NULL,
    "priceChange24h" TEXT NOT NULL DEFAULT '0',
    "priceChangePercent24h" TEXT NOT NULL DEFAULT '0',
    "high24h" TEXT NOT NULL,
    "low24h" TEXT NOT NULL,
    "volume24h" TEXT NOT NULL DEFAULT '0',
    "quoteVolume24h" TEXT NOT NULL DEFAULT '0',
    "lastTradeId" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketTicker_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "MarketTickerCandle" (
    "marketId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "open" TEXT NOT NULL,
    "high" TEXT NOT NULL,
    "low" TEXT NOT NULL,
    "close" TEXT NOT NULL,
    "volume" TEXT NOT NULL DEFAULT '0',
    "quoteVolume" TEXT NOT NULL DEFAULT '0',
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "lastTradeId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketTickerCandle_pkey" PRIMARY KEY ("marketId", "interval", "bucketStart")
);

-- CreateIndex
CREATE INDEX "MarketTicker_updatedAt_idx" ON "MarketTicker"("updatedAt");

-- CreateIndex
CREATE INDEX "MarketTickerCandle_marketId_interval_bucketStart_idx" ON "MarketTickerCandle"("marketId", "interval", "bucketStart");

-- AddForeignKey
ALTER TABLE "MarketTicker" ADD CONSTRAINT "MarketTicker_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketTickerCandle" ADD CONSTRAINT "MarketTickerCandle_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Convert candle rows into a TimescaleDB hypertable partitioned by bucket start.
SELECT create_hypertable('"MarketTickerCandle"', 'bucketStart', if_not_exists => TRUE, migrate_data => TRUE);
