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
    precision: number;
    minQty: number; // convert to bigint for calc
    tickSize: number; // convert to bigint for calc
    lotSize: number; // convert to bigint for calc
    minNotional: number; // convert to bigint for calc
}

export interface BaseOrderType {
    entryPrice?: string; // convert to bigint for calc
    quantity: string; // convert to bigint for calc
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

export interface FillType {
    price: string; // convert to bigint for calc
    qty: string; // convert to bigint for calc
    tradeId: string,
    takerOrderId: string,
    takerUserId: string;
    makerOrderId: string,
    makerUserId: string,
    side: OrderSide,
    market: Market,
    status: FillStatus;
}

export interface DepthType { price: string, quantity: string }// convert to bigint for calc

export interface BalanceEntry {
    total: string; // convert to bigint for calc
    locked: string; // convert to bigint for calc
}

export type ReturnBalanceType = Partial<
    Record<string, BalanceEntry>
>;