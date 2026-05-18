export type OrderId = string;
export type UserId = string;
export type MarketId = string;

export enum MarketType {
    SPOT = "SPOT",
    PERP = "PERP"
}

export enum OrderType {
    LIMIT = "LIMIT",
    MARKET = "MARKET"
}

export enum OrderSide {
    LONG = "LONG",
    SHORT = "SHORT"
}

export enum OrderStatus {
    OPEN = "OPEN",
    PARTIAL = "PARTIAL",
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

export interface Market {
    id: MarketId;
    name: string;
    baseAsset: string;
    quoteAsset: string;
    maxLeverage: number;
    minQty: bigint;
    tickSize: bigint;
    lotSize: bigint;
    minNotional: bigint;
}

export interface BaseOrderType {
    entryPrice?: bigint;
    quantity: bigint;
    userId: string;
    marketId: MarketId;
    side: OrderSide;
    type: OrderType;
    postOnly: boolean;
    stpMode: STPMode;
    timeInForce: TimeInForce;
    createdAt: number;
}

export interface FillType {
    price: bigint,
    qty: bigint,
    tradeId: string,
    takerOrderId: string,
    takerUserId: string;
    makerOrderId: string,
    makerUserId: string,
    side: OrderSide,
    market: Market,
    status: FillStatus;
}

export interface DepthType { price: bigint, quantity: bigint }

export interface BalanceEntry {
    total: bigint;
    locked: bigint;
}

export type ReturnBalanceType = Partial<
    Record<string, BalanceEntry>
>;