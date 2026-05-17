export type MarketSymbolType = `${BaseAssetType}_${QuoteAssetType}`;

export type BaseAssetType = "BTC" | "ETH" | "SOL";
export type QuoteAssetType = "INR" | "USD" | "PERP";

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

export type UserBalanceType = Map<BaseAssetType | QuoteAssetType, { total: number, locked: number }>

export type WithoutSequenceOrderType<T> = T extends any ? Omit<T, "sequence"> : never;

export enum STPMode {
    CANCEL_MAKER = "CANCEL_MAKER",
    CANCEL_TAKER = "CANCEL_TAKER",
    CANCEL_BOTH = "CANCEL_BOTH"
}

export enum TimeInForce {
    GTC = "GTC",
    IOC = "IOC",
    FOK = "FOK",
}

export interface BaseOrderType {
    price: bigint,
    quantity: bigint,
    userId: string,
    market: MarketSymbolType,
    side: OrderSide,
    type: OrderType,
    leverage: number
    postOnly?: boolean;
    stpMode?: STPMode;
    timeInForce?: TimeInForce;
    reduceOnly?: boolean;
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
    market: MarketSymbolType,
    status: FillStatus;
}

export interface DepthType { price: bigint, quantity: bigint }

export type ReturnBalanceType = Partial<Record<BaseAssetType | QuoteAssetType, bigint>>;

