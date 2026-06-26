import {
    AssetTransactionStatus as PrismaAssetTransactionStatus,
    AssetTransactionType as PrismaAssetTransactionType,
    FillStatus as PrismaFillStatus,
    MarketType as PrismaMarketType,
    OrderPosition as PrismaOrderPosition,
    OrderStatus as PrismaOrderStatus,
    OrderType as PrismaOrderType,
    prisma,
    STPMode as PrismaSTPMode,
    TimeInForce as PrismaTimeInForce,
    TradeSide as PrismaTradeSide,
} from "@workspace/database";
import { initializeStreams, RedisManager } from "@workspace/redis-streams";
import {
    CONSUMER_GROUPS,
    CONSUMERS,
    DatabaseAssetRecord,
    DatabaseAssetTransactionRecord,
    DatabaseFundingPaymentRecord,
    DatabaseFundingSettlementRecord,
    DatabaseLiquidationEventRecord,
    DatabaseMarketRecord,
    DatabaseOrderRecord,
    DatabaseTickerCandleRecord,
    DatabaseTickerInterval,
    DatabaseTickerRecord,
    DatabaseTradeRecord,
    DatabaseWritePayload,
    MarketDataEvent,
    REDIS_STREAMS,
    TickerUpdateEvent,
    TimeInForce,
    TradeResultEvent,
} from "@workspace/types";

type RedisStreamMessage = {
    id: string;
    message: {
        data?: unknown;
    };
};

const BATCH_SIZE = Number(process.env.DATABASE_ENGINE_BATCH_SIZE ?? 100);
const BLOCK_TIME_MS = Number(process.env.DATABASE_ENGINE_BLOCK_TIME_MS ?? 1_000);
const TICKER_CANDLE_INTERVALS: Array<{ interval: DatabaseTickerInterval; durationMs: number }> = [
    { interval: "1m", durationMs: 60_000 },
    { interval: "15m", durationMs: 15 * 60_000 },
    { interval: "1h", durationMs: 60 * 60_000 },
    { interval: "1w", durationMs: 7 * 24 * 60 * 60_000 },
];

type DatabasePersistenceEvent = {
    payload: DatabaseWritePayload;
};

function byId<T extends { id: string }>(records: T[]) {
    return byKey(records, (record) => record.id);
}

function byKey<T>(records: T[], getKey: (record: T) => string) {
    return Array.from(new Map(records.map((record) => [getKey(record), record])).values());
}

function toDate(timestamp?: number) {
    return typeof timestamp === "number" ? new Date(timestamp) : undefined;
}

function requiredDate(timestamp: number) {
    return new Date(timestamp);
}

function withoutUndefined<T extends Record<string, unknown>>(record: T): T {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function toPrismaMarketType(value: DatabaseMarketRecord["marketType"]) {
    return PrismaMarketType[value];
}

function toPrismaOrderType(value: DatabaseOrderRecord["type"]) {
    return PrismaOrderType[value];
}

function toPrismaTradeSide(value: DatabaseOrderRecord["side"]) {
    return PrismaTradeSide[value];
}

function toPrismaOrderPosition(value?: DatabaseOrderRecord["position"]) {
    return value ? PrismaOrderPosition[value] : undefined;
}

function toPrismaOrderStatus(value: DatabaseOrderRecord["status"]) {
    return PrismaOrderStatus[value];
}

function toPrismaFillStatus(value: DatabaseTradeRecord["status"]) {
    return PrismaFillStatus[value];
}

function toPrismaSTPMode(value: DatabaseOrderRecord["stpMode"]) {
    return PrismaSTPMode[value];
}

function toPrismaTimeInForce(value: DatabaseOrderRecord["timeInForce"]) {
    switch (value) {
        case TimeInForce.GTC:
            return PrismaTimeInForce.GTC;
        case TimeInForce.IOC:
            return PrismaTimeInForce.IOC;
        case TimeInForce.FOK:
            return PrismaTimeInForce.FOK;
    }
}

function toPrismaAssetTransactionType(value: DatabaseAssetTransactionRecord["type"]) {
    return PrismaAssetTransactionType[value];
}

function toPrismaAssetTransactionStatus(value: DatabaseAssetTransactionRecord["status"]) {
    return PrismaAssetTransactionStatus[value];
}

function collect(events: DatabasePersistenceEvent[]) {
    return {
        assets: byId(events.flatMap((event) => event.payload.assets ?? [])),
        markets: byId(events.flatMap((event) => event.payload.markets ?? [])),
        orders: byId(events.flatMap((event) => event.payload.orders ?? [])),
        trades: byId(events.flatMap((event) => event.payload.trades ?? [])),
        tickers: byKey(events.flatMap((event) => event.payload.tickers ?? []), (ticker) => ticker.marketId),
        tickerCandles: byKey(
            events.flatMap((event) => event.payload.tickerCandles ?? []),
            (candle) => `${candle.marketId}:${candle.interval}:${candle.bucketStart}:${candle.engineTradeId}`
        ),
        assetTransactions: byId(events.flatMap((event) => event.payload.assetTransactions ?? [])),
        fundingSettlements: byId(events.flatMap((event) => event.payload.fundingSettlements ?? [])),
        fundingPayments: byId(events.flatMap((event) => event.payload.fundingPayments ?? [])),
        liquidationEvents: byId(events.flatMap((event) => event.payload.liquidationEvents ?? [])),
    };
}

function assetCreateData(asset: DatabaseAssetRecord) {
    return {
        id: asset.id,
        symbol: asset.symbol,
        precision: asset.precision,
        name: asset.name,
        logo: asset.logo,
        active: asset.active ?? true,
    };
}

function marketCreateData(market: DatabaseMarketRecord) {
    return {
        id: market.id,
        name: market.name,
        marketType: toPrismaMarketType(market.marketType),
        baseAssetId: market.baseAssetId,
        quoteAssetId: market.quoteAssetId,
        maxLeverage: market.maxLeverage,
        minQty: market.minQty,
        tickSize: market.tickSize,
        lotSize: market.lotSize,
        minNotional: market.minNotional,
        active: market.active ?? true,
    };
}

function orderCreateData(order: DatabaseOrderRecord) {
    return withoutUndefined({
        id: order.id,
        userId: order.userId,
        marketId: order.marketId,
        marketType: toPrismaMarketType(order.marketType),
        type: toPrismaOrderType(order.type),
        side: toPrismaTradeSide(order.side),
        position: toPrismaOrderPosition(order.position),
        status: toPrismaOrderStatus(order.status),
        entryPrice: order.entryPrice,
        quantity: order.quantity,
        filledQuantity: order.filledQuantity,
        remainingQuantity: order.remainingQuantity,
        averagePrice: order.averagePrice,
        postOnly: order.postOnly,
        reduceOnly: order.reduceOnly,
        liquidation: order.liquidation,
        leverage: order.leverage,
        margin: order.margin,
        stpMode: toPrismaSTPMode(order.stpMode),
        timeInForce: toPrismaTimeInForce(order.timeInForce),
        createdAt: toDate(order.createdAt),
        cancelledAt: toDate(order.cancelledAt),
        filledAt: toDate(order.filledAt),
    });
}

function orderUpdateData(order: DatabaseOrderRecord) {
    const { id: _id, userId: _userId, marketId: _marketId, createdAt: _createdAt, ...rest } = orderCreateData(order);
    return rest;
}

function tradeCreateData(trade: DatabaseTradeRecord) {
    return {
        id: trade.id,
        engineTradeId: BigInt(trade.engineTradeId),
        marketId: trade.marketId,
        price: trade.price,
        quantity: trade.quantity,
        side: toPrismaTradeSide(trade.side),
        status: toPrismaFillStatus(trade.status),
        makerOrderId: trade.makerOrderId,
        takerOrderId: trade.takerOrderId,
        makerUserId: trade.makerUserId,
        takerUserId: trade.takerUserId,
        makerFee: trade.makerFee,
        takerFee: trade.takerFee,
        createdAt: toDate(trade.createdAt),
    };
}

function assetTransactionCreateData(transaction: DatabaseAssetTransactionRecord) {
    return withoutUndefined({
        id: transaction.id,
        userId: transaction.userId,
        assetId: transaction.assetId,
        type: toPrismaAssetTransactionType(transaction.type),
        status: toPrismaAssetTransactionStatus(transaction.status),
        amount: transaction.amount,
        referenceId: transaction.referenceId,
        reason: transaction.reason,
        createdAt: toDate(transaction.createdAt),
        appliedAt: toDate(transaction.appliedAt),
    });
}

function fundingSettlementCreateData(settlement: DatabaseFundingSettlementRecord) {
    return {
        id: settlement.id,
        marketId: settlement.marketId,
        indexPrice: settlement.indexPrice,
        markPrice: settlement.markPrice,
        intervalSeconds: settlement.intervalSeconds,
        fundingRateBps: settlement.fundingRateBps,
        insuranceUsed: settlement.insuranceUsed,
        paymentsCount: settlement.paymentsCount,
        settledAt: toDate(settlement.settledAt),
    };
}

function fundingPaymentCreateData(payment: DatabaseFundingPaymentRecord) {
    return withoutUndefined({
        id: payment.id,
        settlementId: payment.settlementId,
        marketId: payment.marketId,
        userId: payment.userId,
        positionId: payment.positionId,
        amount: payment.amount,
        fundingRateBps: payment.fundingRateBps,
        createdAt: toDate(payment.createdAt),
    });
}

function liquidationEventCreateData(event: DatabaseLiquidationEventRecord) {
    return withoutUndefined({
        id: event.id,
        marketId: event.marketId,
        liquidatedUserId: event.liquidatedUserId,
        liquidatorUserId: event.liquidatorUserId,
        liquidationOrderId: event.liquidationOrderId,
        indexPrice: event.indexPrice,
        quantity: event.quantity,
        bankruptcyPrice: event.bankruptcyPrice,
        liquidationPrice: event.liquidationPrice,
        insuranceUsed: event.insuranceUsed,
        createdAt: toDate(event.createdAt),
    });
}

async function upsertAssets(assets: DatabaseAssetRecord[]) {
    if (assets.length === 0) {
        return;
    }

    await prisma.asset.createMany({ data: assets.map(assetCreateData), skipDuplicates: true });
    await prisma.$transaction(
        assets.map((asset) => prisma.asset.update({ where: { id: asset.id }, data: assetCreateData(asset) }))
    );
}

async function upsertMarkets(markets: DatabaseMarketRecord[]) {
    if (markets.length === 0) {
        return;
    }

    await prisma.$transaction(
        markets.map((market) => prisma.market.upsert({
            where: { id: market.id },
            create: marketCreateData(market),
            update: marketCreateData(market),
        }))
    );
}

async function upsertOrders(orders: DatabaseOrderRecord[]) {
    if (orders.length === 0) {
        return;
    }

    await prisma.order.createMany({ data: orders.map(orderCreateData), skipDuplicates: true });
    await prisma.$transaction(
        orders.map((order) => prisma.order.update({ where: { id: order.id }, data: orderUpdateData(order) }))
    );
}

async function createAppendOnlyRecords(records: ReturnType<typeof collect>) {
    await prisma.$transaction([
        ...(records.trades.length > 0
            ? [prisma.trade.createMany({ data: records.trades.map(tradeCreateData), skipDuplicates: true })]
            : []),
        ...(records.assetTransactions.length > 0
            ? [prisma.assetTransaction.createMany({
                data: records.assetTransactions.map(assetTransactionCreateData),
                skipDuplicates: true,
            })]
            : []),
        ...(records.fundingSettlements.length > 0
            ? [prisma.fundingSettlement.createMany({
                data: records.fundingSettlements.map(fundingSettlementCreateData),
                skipDuplicates: true,
            })]
            : []),
        ...(records.fundingPayments.length > 0
            ? [prisma.fundingPayment.createMany({
                data: records.fundingPayments.map(fundingPaymentCreateData),
                skipDuplicates: true,
            })]
            : []),
        ...(records.liquidationEvents.length > 0
            ? [prisma.liquidationEvent.createMany({
                data: records.liquidationEvents.map(liquidationEventCreateData),
                skipDuplicates: true,
            })]
            : []),
    ]);
}

async function upsertTickers(tickers: DatabaseTickerRecord[]) {
    if (tickers.length === 0) {
        return;
    }

    await prisma.$transaction(
        tickers.map((ticker) => prisma.$executeRaw`
            INSERT INTO "MarketTicker" (
                "marketId",
                "lastPrice",
                "priceChange24h",
                "priceChangePercent24h",
                "high24h",
                "low24h",
                "volume24h",
                "quoteVolume24h",
                "lastTradeId",
                "updatedAt"
            )
            VALUES (
                ${ticker.marketId},
                ${ticker.lastPrice},
                ${ticker.priceChange24h},
                ${ticker.priceChangePercent24h},
                ${ticker.high24h},
                ${ticker.low24h},
                ${ticker.volume24h},
                ${ticker.quoteVolume24h},
                ${BigInt(ticker.engineTradeId)},
                ${requiredDate(ticker.updatedAt)}
            )
            ON CONFLICT ("marketId") DO UPDATE SET
                "lastPrice" = EXCLUDED."lastPrice",
                "priceChange24h" = EXCLUDED."priceChange24h",
                "priceChangePercent24h" = EXCLUDED."priceChangePercent24h",
                "high24h" = EXCLUDED."high24h",
                "low24h" = EXCLUDED."low24h",
                "volume24h" = EXCLUDED."volume24h",
                "quoteVolume24h" = EXCLUDED."quoteVolume24h",
                "lastTradeId" = EXCLUDED."lastTradeId",
                "updatedAt" = EXCLUDED."updatedAt"
            WHERE "MarketTicker"."lastTradeId" IS NULL
                OR "MarketTicker"."lastTradeId" < EXCLUDED."lastTradeId"
        `)
    );
}

async function upsertTickerCandles(candles: DatabaseTickerCandleRecord[]) {
    if (candles.length === 0) {
        return;
    }

    await prisma.$transaction(
        candles.map((candle) => prisma.$executeRaw`
            INSERT INTO "MarketTickerCandle" (
                "marketId",
                "interval",
                "bucketStart",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "quoteVolume",
                "tradeCount",
                "lastTradeId",
                "updatedAt"
            )
            VALUES (
                ${candle.marketId},
                ${candle.interval},
                ${requiredDate(candle.bucketStart)},
                ${candle.open},
                ${candle.high},
                ${candle.low},
                ${candle.close},
                ${candle.volume},
                ${candle.quoteVolume},
                ${candle.tradeCount},
                ${BigInt(candle.engineTradeId)},
                ${requiredDate(candle.updatedAt)}
            )
            ON CONFLICT ("marketId", "interval", "bucketStart") DO UPDATE SET
                "high" = CASE
                    WHEN EXCLUDED."high"::numeric > "MarketTickerCandle"."high"::numeric THEN EXCLUDED."high"
                    ELSE "MarketTickerCandle"."high"
                END,
                "low" = CASE
                    WHEN EXCLUDED."low"::numeric < "MarketTickerCandle"."low"::numeric THEN EXCLUDED."low"
                    ELSE "MarketTickerCandle"."low"
                END,
                "close" = EXCLUDED."close",
                "volume" = ("MarketTickerCandle"."volume"::numeric + EXCLUDED."volume"::numeric)::text,
                "quoteVolume" = ("MarketTickerCandle"."quoteVolume"::numeric + EXCLUDED."quoteVolume"::numeric)::text,
                "tradeCount" = "MarketTickerCandle"."tradeCount" + EXCLUDED."tradeCount",
                "lastTradeId" = EXCLUDED."lastTradeId",
                "updatedAt" = EXCLUDED."updatedAt"
            WHERE "MarketTickerCandle"."lastTradeId" IS NULL
                OR "MarketTickerCandle"."lastTradeId" < EXCLUDED."lastTradeId"
        `)
    );
}

async function persistDatabaseEvents(events: DatabasePersistenceEvent[]) {
    if (events.length === 0) {
        return;
    }

    const records = collect(events);

    await upsertAssets(records.assets);
    await upsertMarkets(records.markets);
    await upsertOrders(records.orders);
    await createAppendOnlyRecords(records);
    await upsertTickers(records.tickers);
    await upsertTickerCandles(records.tickerCandles);

    console.log(
        `Persisted database batch: events=${events.length}, orders=${records.orders.length}, trades=${records.trades.length}, tickers=${records.tickers.length}, tickerCandles=${records.tickerCandles.length}`
    );
}

async function ack(redis: Awaited<ReturnType<typeof RedisManager.getInstance>>, messageIds: string[]) {
    await Promise.all(messageIds.map((id) => redis.xAck(REDIS_STREAMS.ENGINE_RESULT, CONSUMER_GROUPS.DATABASE_ENGINE, id)));
}

function parseMessage(message: RedisStreamMessage): DatabasePersistenceEvent | null {
    const raw = message.message.data;

    if (typeof raw !== "string") {
        throw new Error("Invalid engine result stream message data");
    }

    return resultToDatabaseEvent(JSON.parse(raw) as TradeResultEvent);
}

function resultToDatabaseEvent(result: TradeResultEvent): DatabasePersistenceEvent | null {
    const databasePayload = result.updates?.database ?? result.payload?.updates?.database;
    const marketData = result.updates?.marketData ?? result.payload?.updates?.marketData ?? [];
    const tickerEvents = marketData.filter(isTickerTradeUpdate);
    const payload: DatabaseWritePayload = {
        ...(databasePayload ?? {}),
        ...(tickerEvents.length > 0
            ? { tickers: tickerEvents.map(tickerRecordFromEvent) }
            : {}),
        ...(tickerEvents.length > 0
            ? { tickerCandles: tickerEvents.flatMap(tickerCandleRecordsFromEvent) }
            : {}),
    };

    return Object.keys(payload).length > 0 ? { payload } : null;
}

function isTickerTradeUpdate(event: MarketDataEvent): event is TickerUpdateEvent & { tradeId: string } {
    return event.type === "ticker.update" && typeof event.tradeId === "string";
}

function tickerRecordFromEvent(event: TickerUpdateEvent & { tradeId: string }): DatabaseTickerRecord {
    return {
        marketId: event.marketId,
        lastPrice: event.data.lastPrice,
        priceChange24h: event.data.priceChange24h,
        priceChangePercent24h: event.data.priceChangePercent24h,
        high24h: event.data.high24h,
        low24h: event.data.low24h,
        volume24h: event.data.volume24h,
        quoteVolume24h: event.data.quoteVolume24h,
        engineTradeId: event.tradeId,
        updatedAt: event.eventTs,
    };
}

function tickerCandleRecordsFromEvent(event: TickerUpdateEvent & { tradeId: string }): DatabaseTickerCandleRecord[] {
    const quantity = event.data.lastQuantity;
    const quoteVolume = event.data.lastQuoteVolume;

    if (!quantity || !quoteVolume) {
        return [];
    }

    return TICKER_CANDLE_INTERVALS.map(({ interval, durationMs }) => ({
        marketId: event.marketId,
        interval,
        bucketStart: bucketStartMs(event.eventTs, interval, durationMs),
        open: event.data.lastPrice,
        high: event.data.lastPrice,
        low: event.data.lastPrice,
        close: event.data.lastPrice,
        volume: quantity,
        quoteVolume,
        tradeCount: 1,
        engineTradeId: event.tradeId,
        updatedAt: event.eventTs,
    }));
}

function bucketStartMs(timestamp: number, interval: DatabaseTickerInterval, durationMs: number) {
    if (interval !== "1w") {
        return Math.floor(timestamp / durationMs) * durationMs;
    }

    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const daysSinceMonday = (day + 6) % 7;

    return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() - daysSinceMonday,
        0,
        0,
        0,
        0
    );
}

async function start() {
    if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE <= 0) {
        throw new Error("DATABASE_ENGINE_BATCH_SIZE must be a positive integer");
    }

    if (!Number.isInteger(BLOCK_TIME_MS) || BLOCK_TIME_MS <= 0) {
        throw new Error("DATABASE_ENGINE_BLOCK_TIME_MS must be a positive integer");
    }

    await initializeStreams();

    const blockingRedis = await RedisManager.createBlockingConnection(
        `${REDIS_STREAMS.ENGINE_RESULT}:${CONSUMER_GROUPS.DATABASE_ENGINE}:${CONSUMERS.DATABASE_ENGINE}-${process.pid}`
    );
    const redis = await RedisManager.getInstance();
    const consumer = `${CONSUMERS.DATABASE_ENGINE}-${process.pid}`;

    console.log("Database engine started");

    while (true) {
        const response = await blockingRedis.xReadGroup(
            CONSUMER_GROUPS.DATABASE_ENGINE,
            consumer,
            [{ key: REDIS_STREAMS.ENGINE_RESULT, id: ">" }],
            { BLOCK: BLOCK_TIME_MS, COUNT: BATCH_SIZE }
        );

        if (!response) {
            continue;
        }

        for (const streamData of response) {
            const messages = streamData.messages as RedisStreamMessage[];
            const parsedEvents: DatabasePersistenceEvent[] = [];
            const ackIds: string[] = [];

            for (const message of messages) {
                try {
                    const parsed = parseMessage(message);
                    if (parsed) {
                        parsedEvents.push(parsed);
                    }
                    ackIds.push(message.id);
                } catch (error) {
                    console.error("Invalid database stream event", error);
                    ackIds.push(message.id);
                }
            }

            await persistDatabaseEvents(parsedEvents);
            await ack(redis, ackIds);
        }
    }
}

start().catch((error) => {
    console.error("Database engine crashed", error);
    process.exit(1);
});
