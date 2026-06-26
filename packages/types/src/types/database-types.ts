import {
    FillStatus,
    MarketId,
    MarketType,
    OrderPosition,
    OrderSide,
    OrderStatus,
    OrderType,
    STPMode,
    TimeInForce,
    UserId,
} from "./base";
import type { IncomingEventTypes } from "./nats-types";

export type DatabaseAssetRecord = {
    id: string;
    symbol: string;
    precision: number;
    name?: string;
    logo?: string;
    active?: boolean;
};

export type DatabaseMarketRecord = {
    id: MarketId;
    name: string;
    marketType: MarketType;
    baseAssetId: string;
    quoteAssetId: string;
    maxLeverage: number;
    minQty: string;
    tickSize: string;
    lotSize: string;
    minNotional: string;
    active?: boolean;
};

export type DatabaseOrderRecord = {
    id: string;
    userId: UserId;
    marketId: MarketId;
    marketType: MarketType;
    type: OrderType;
    side: OrderSide;
    position?: OrderPosition;
    status: OrderStatus;
    entryPrice: string;
    quantity: string;
    filledQuantity: string;
    remainingQuantity: string;
    averagePrice: string;
    postOnly: boolean;
    reduceOnly: boolean;
    liquidation: boolean;
    leverage?: number;
    margin?: string;
    stpMode: STPMode;
    timeInForce: TimeInForce;
    createdAt: number;
    cancelledAt?: number;
    filledAt?: number;
};

export type DatabaseTradeRecord = {
    id: string;
    engineTradeId: string;
    marketId: MarketId;
    price: string;
    quantity: string;
    side: OrderSide;
    status: FillStatus;
    makerOrderId: string;
    takerOrderId: string;
    makerUserId: UserId;
    takerUserId: UserId;
    makerFee: string;
    takerFee: string;
    createdAt: number;
};

export type DatabaseTickerInterval = "1m" | "15m" | "1h" | "1w";

export type DatabaseTickerRecord = {
    marketId: MarketId;
    lastPrice: string;
    priceChange24h: string;
    priceChangePercent24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    quoteVolume24h: string;
    engineTradeId: string;
    updatedAt: number;
};

export type DatabaseTickerCandleRecord = {
    marketId: MarketId;
    interval: DatabaseTickerInterval;
    bucketStart: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    quoteVolume: string;
    tradeCount: number;
    engineTradeId: string;
    updatedAt: number;
};

export type DatabaseAssetTransactionRecord = {
    id: string;
    userId: UserId;
    assetId: string;
    type: "ON_RAMP" | "DEPOSIT" | "WITHDRAWAL" | "ADJUSTMENT";
    status: "PENDING" | "APPLIED" | "REJECTED" | "CANCELLED";
    amount: string;
    referenceId?: string;
    reason?: string;
    createdAt: number;
    appliedAt?: number;
};

export type DatabaseFundingSettlementRecord = {
    id: string;
    marketId: MarketId;
    indexPrice: string;
    markPrice: string;
    intervalSeconds: number;
    fundingRateBps: string;
    insuranceUsed: string;
    paymentsCount: number;
    settledAt: number;
};

export type DatabaseFundingPaymentRecord = {
    id: string;
    settlementId?: string;
    marketId: MarketId;
    userId: UserId;
    positionId: string;
    amount: string;
    fundingRateBps: string;
    createdAt: number;
};

export type DatabaseLiquidationEventRecord = {
    id: string;
    marketId: MarketId;
    liquidatedUserId: UserId;
    liquidatorUserId?: UserId;
    liquidationOrderId?: string;
    indexPrice: string;
    quantity: string;
    bankruptcyPrice?: string;
    liquidationPrice?: string;
    insuranceUsed: string;
    createdAt: number;
};

export type DatabaseWritePayload = {
    assets?: DatabaseAssetRecord[];
    markets?: DatabaseMarketRecord[];
    orders?: DatabaseOrderRecord[];
    trades?: DatabaseTradeRecord[];
    tickers?: DatabaseTickerRecord[];
    tickerCandles?: DatabaseTickerCandleRecord[];
    assetTransactions?: DatabaseAssetTransactionRecord[];
    fundingSettlements?: DatabaseFundingSettlementRecord[];
    fundingPayments?: DatabaseFundingPaymentRecord[];
    liquidationEvents?: DatabaseLiquidationEventRecord[];
};

export type DatabaseWriteEvent = {
    eventId: number;
    sourceEventType: IncomingEventTypes;
    timestamp: number;
    payload: DatabaseWritePayload;
};
