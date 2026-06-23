import { RedisPublisher } from "@workspace/redis-streams";
import {
    Asset,
    DatabaseAssetRecord,
    DatabaseAssetTransactionRecord,
    DatabaseFundingPaymentRecord,
    DatabaseFundingSettlementRecord,
    DatabaseLiquidationEventRecord,
    DatabaseMarketRecord,
    DatabaseOrderRecord,
    DatabaseTradeRecord,
    DatabaseWritePayload,
    FillType,
    FundingPayment,
    FundingSettlePayload,
    FundingSettleReturnPayload,
    IncomingEventTypes,
    InMarketOrderType,
    Market,
    MarketType,
    NormalizeOrderReturnType,
    OnRampPayload,
    OnRampReturnPayload,
    OrderPosition,
    OrderStatus,
    UserPositionType,
} from "@workspace/types";
import { formatBigInt, normalizeOrderReturn } from "./parse-incoming";

type DatabaseWriteBucket = Required<DatabaseWritePayload>;

function emptyBucket(): DatabaseWriteBucket {
    return {
        assets: [],
        markets: [],
        orders: [],
        trades: [],
        assetTransactions: [],
        fundingSettlements: [],
        fundingPayments: [],
        liquidationEvents: [],
    };
}

export class DatabaseManager {
    private pending = emptyBucket();

    reset() {
        this.pending = emptyBucket();
    }

    captureOrder(order: InMarketOrderType, market?: Market) {
        this.captureMarketContext(market, order.marketType);
        this.pending.orders.push(this.toOrderRecord(order, market));
        this.pending.trades.push(...this.toTradeRecords(normalizeOrderReturn(order, market).fills));
    }

    captureOrders(orders: Iterable<InMarketOrderType>, market?: Market) {
        for (const order of orders) {
            this.captureOrder(order, market);
        }
    }

    captureOnRamp(payload: OnRampPayload, result: OnRampReturnPayload) {
        if (!result.success || !result.data) {
            return;
        }

        this.pending.assetTransactions.push({
            id: `asset-tx:${result.eventId}`,
            userId: payload.userId,
            assetId: payload.assetId,
            type: "ON_RAMP",
            status: "APPLIED",
            amount: payload.amount,
            createdAt: result.timestamp,
            appliedAt: result.timestamp,
        });
    }

    captureAsset(asset: Asset) {
        this.pending.assets.push(this.toAssetRecord(asset));
    }

    captureMarket(market: Market, marketType = this.inferMarketType(market.id)) {
        this.captureMarketContext(market, marketType);
    }

    captureDeletedMarket(market: Market) {
        this.pending.assets.push(this.toAssetRecord(market.baseAsset), this.toAssetRecord(market.quoteAsset));
        this.pending.markets.push({
            ...this.toMarketRecord(market, this.inferMarketType(market.id)),
            active: false,
        });
    }

    captureFundingSettlement(
        payload: FundingSettlePayload,
        result: FundingSettleReturnPayload,
        payments: FundingPayment[],
        market?: Market
    ) {
        if (!result.success || !result.data) {
            return;
        }

        this.captureMarketContext(market, MarketType.PERP);

        const settlementId = `funding:${payload.marketId}:${result.eventId}`;

        this.pending.fundingSettlements.push({
            id: settlementId,
            marketId: payload.marketId,
            indexPrice: payload.indexPrice,
            markPrice: payload.markPrice,
            intervalSeconds: payload.intervalSeconds,
            fundingRateBps: result.data.fundingRateBps,
            insuranceUsed: result.data.insuranceUsed,
            paymentsCount: result.data.payments,
            settledAt: result.timestamp,
        });

        this.pending.fundingPayments.push(...payments.map((payment) => this.toFundingPaymentRecord(payment, settlementId, market)));
    }

    captureLiquidation(position: UserPositionType, order: NormalizeOrderReturnType, indexPrice: string, market?: Market, timestamp = Date.now()) {
        this.captureMarketContext(market, MarketType.PERP);

        this.pending.liquidationEvents.push({
            id: `liquidation:${position.positionId}:${timestamp}`,
            marketId: position.market,
            liquidatedUserId: position.userId,
            liquidationOrderId: order.orderId,
            indexPrice,
            quantity: order.quantity,
            bankruptcyPrice: this.formatQuote(position.bankruptcyPrice, market),
            liquidationPrice: this.formatQuote(position.liquidationPrice, market),
            insuranceUsed: "0",
            createdAt: timestamp,
        });
    }

    async publish(sourceEventType: IncomingEventTypes, eventId: number, timestamp: number) {
        const payload = this.compact();

        if (!payload) {
            return;
        }

        await RedisPublisher.publishDatabaseEvent({
            eventId,
            sourceEventType,
            timestamp,
            payload,
        });
    }

    private compact(): DatabaseWritePayload | undefined {
        const payload: DatabaseWritePayload = {};

        this.assignIfAny(payload, "assets", this.dedupe(this.pending.assets, (asset) => asset.id));
        this.assignIfAny(payload, "markets", this.dedupe(this.pending.markets, (market) => market.id));
        this.assignIfAny(payload, "orders", this.dedupe(this.pending.orders, (order) => order.id));
        this.assignIfAny(payload, "trades", this.dedupe(this.pending.trades, (trade) => trade.id));
        this.assignIfAny(
            payload,
            "assetTransactions",
            this.dedupe(this.pending.assetTransactions, (transaction) => transaction.id)
        );
        this.assignIfAny(
            payload,
            "fundingSettlements",
            this.dedupe(this.pending.fundingSettlements, (settlement) => settlement.id)
        );
        this.assignIfAny(
            payload,
            "fundingPayments",
            this.dedupe(this.pending.fundingPayments, (payment) => payment.id)
        );
        this.assignIfAny(
            payload,
            "liquidationEvents",
            this.dedupe(this.pending.liquidationEvents, (event) => event.id)
        );

        return Object.keys(payload).length > 0 ? payload : undefined;
    }

    private assignIfAny<K extends keyof DatabaseWritePayload>(payload: DatabaseWritePayload, key: K, values: NonNullable<DatabaseWritePayload[K]>) {
        if (values.length > 0) {
            Object.assign(payload, { [key]: values });
        }
    }

    private captureMarketContext(market?: Market, marketType = market ? this.inferMarketType(market.id) : MarketType.SPOT) {
        if (!market) {
            return;
        }

        this.pending.assets.push(this.toAssetRecord(market.baseAsset), this.toAssetRecord(market.quoteAsset));
        this.pending.markets.push(this.toMarketRecord(market, marketType));
    }

    private toAssetRecord(asset: Asset): DatabaseAssetRecord {
        return {
            id: asset.id,
            symbol: asset.symbol,
            precision: asset.precision,
            active: true,
        };
    }

    private toMarketRecord(market: Market, marketType: MarketType): DatabaseMarketRecord {
        return {
            id: market.id,
            name: market.name,
            marketType,
            baseAssetId: market.baseAsset.id,
            quoteAssetId: market.quoteAsset.id,
            maxLeverage: market.maxLeverage,
            minQty: market.minQty.toString(),
            tickSize: market.tickSize.toString(),
            lotSize: market.lotSize.toString(),
            minNotional: market.minNotional.toString(),
            active: true,
        };
    }

    private toOrderRecord(order: InMarketOrderType, market?: Market): DatabaseOrderRecord {
        const normalized = normalizeOrderReturn(order, market);
        const filledAt = order.status === OrderStatus.FILLED ? Date.now() : undefined;
        const cancelledAt = order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED ? Date.now() : undefined;

        return {
            id: normalized.orderId,
            userId: normalized.userId,
            marketId: normalized.marketId,
            marketType: normalized.marketType,
            type: normalized.type,
            side: normalized.side,
            position: normalized.position,
            status: normalized.status,
            entryPrice: normalized.entryPrice,
            quantity: normalized.quantity,
            filledQuantity: normalized.filled,
            remainingQuantity: normalized.remainingQty,
            averagePrice: normalized.averagePrice,
            postOnly: normalized.postOnly,
            reduceOnly: normalized.marketType === MarketType.PERP ? normalized.reduceOnly : false,
            liquidation: normalized.marketType === MarketType.PERP ? Boolean(normalized.liquidation) : false,
            leverage: normalized.marketType === MarketType.PERP ? normalized.leverage : undefined,
            margin: normalized.marketType === MarketType.PERP ? normalized.margin : undefined,
            stpMode: normalized.stpMode,
            timeInForce: normalized.timeInForce,
            createdAt: normalized.createdAt,
            cancelledAt,
            filledAt,
        };
    }

    private toTradeRecords(fills: FillType[]): DatabaseTradeRecord[] {
        return fills.map((fill) => ({
            id: `${fill.marketId}:${fill.tradeId}`,
            engineTradeId: fill.tradeId,
            marketId: fill.marketId,
            price: fill.price,
            quantity: fill.qty,
            side: fill.side,
            status: fill.status,
            makerOrderId: fill.makerOrderId,
            takerOrderId: fill.takerOrderId,
            makerUserId: fill.makerUserId,
            takerUserId: fill.takerUserId,
            makerFee: "0",
            takerFee: "0",
            createdAt: fill.timestamp,
        }));
    }

    private toFundingPaymentRecord(payment: FundingPayment, settlementId: string, market?: Market): DatabaseFundingPaymentRecord {
        return {
            id: `${settlementId}:${payment.positionId}`,
            settlementId,
            marketId: payment.marketId,
            userId: payment.userId,
            positionId: payment.positionId,
            amount: this.formatQuote(payment.amount, market),
            fundingRateBps: payment.fundingRateBps.toString(),
            createdAt: payment.timestamp,
        };
    }

    private formatQuote(value: bigint, market?: Market) {
        return formatBigInt(value, market?.quoteAsset.precision ?? 0);
    }

    private inferMarketType(marketId: string) {
        return marketId.endsWith("_PERP") ? MarketType.PERP : MarketType.SPOT;
    }

    private dedupe<T>(values: T[], getKey: (value: T) => string): T[] {
        return Array.from(new Map(values.map((value) => [getKey(value), value])).values());
    }
}
