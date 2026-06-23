export type OrderId = string;
export type UserId = string;
export type MarketId = string;

export enum MarketType {
    SPOT = "SPOT",
    PERP = "PERP"
}

export enum OrderPosition {
    LONG = "LONG",
    SHORT = "SHORT"
}

export enum OrderType {
    LIMIT = "LIMIT",
    MARKET = "MARKET"
}

export enum OrderSide {
    BUY = "BUY",
    SELL = "SELL"
}

export enum OrderStatus {
    OPEN = "OPEN",
    PARTIAL_FILLED = "PARTIAL_FILLED",
    PARTIAL_REJECTED = "PARTIAL_REJECTED",
    FILLED = "FILLED",
    CANCELLED = "CANCELLED",
    REJECTED = "REJECTED"
}

export enum FillStatus {
    TRADE = "TRADE",
    STP = "STP"
}

// export type UserBalanceType = Map<BaseAssetType | QuoteAssetType, { total: number, locked: number }>

export type WithoutSequenceOrderType<T> = T extends any ? Omit<T, "sequence"> : never;

export enum STPMode {
    CANCEL_MAKER = "CANCEL_MAKER",
    CANCEL_TAKER = "CANCEL_TAKER",
    CANCEL_BOTH = "CANCEL_BOTH"
}

export enum TimeInForce {
    GTC = "Good_Till_Cancel",
    IOC = "Immediate_OR_Return",
    FOK = "Fill_OR_KILL",
}

export type Asset = {
    id: string;
    symbol: string;
    precision: number;
}

export interface Market {
    id: MarketId;
    name: string;
    baseAsset: Asset;
    quoteAsset: Asset;
    maxLeverage: number;
    minQty: number;
    tickSize: number;
    lotSize: number;
    minNotional: number;
}

export interface MarketRiskState {
    indexPrice: bigint;
    indexUpdatedAt: number;
    lastFundingRateBps: bigint;
    lastFundingSettledAt: number;
}

export interface FundingPayment {
    marketId: MarketId;
    userId: UserId;
    positionId: string;
    amount: bigint;
    fundingRateBps: bigint;
    timestamp: number;
}

export interface BaseOrderType {
    entryPrice: string;
    quantity: string;
    userId: string;
    marketId: MarketId;
    side: OrderSide;
    type: OrderType;
    postOnly: boolean;
    stpMode: STPMode;
    position?: OrderPosition;
    timeInForce: TimeInForce;
    createdAt: number;
}
export type InMarketFillType = {
    price: bigint;
    qty: bigint;
    tradeId: bigint,
    takerOrderId: string,
    takerUserId: string;
    makerOrderId: string,
    makerUserId: string,
    side: OrderSide,
    marketId: MarketId,
    status: FillStatus;
    timestamp: number;
}

export interface FillType {
    price: string;
    qty: string;
    tradeId: string,
    takerOrderId: string,
    takerUserId: string;
    makerOrderId: string,
    makerUserId: string,
    side: OrderSide,
    marketId: MarketId,
    status: FillStatus;
    timestamp: number;
}

export interface DepthType { price: string, quantity: string }

export interface BalanceEntry {
    total: string;
    locked: string;
}

export type ReturnBalanceType = Partial<
    Record<string, BalanceEntry>
>;
