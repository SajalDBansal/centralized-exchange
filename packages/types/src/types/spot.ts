import { BaseOrderType, DepthType, FillType, InMarketFillType, MarketId, MarketType, OrderPosition, OrderSide, OrderStatus, OrderType, STPMode, TimeInForce } from "./base"

interface BaseInMarketOrder {
    entryPrice: bigint; // convert to bigint for calc
    quantity: bigint; // convert to bigint for calc
    userId: string;
    marketId: MarketId;
    side: OrderSide;
    type: OrderType;
    postOnly: boolean;
    stpMode: STPMode;
    position: OrderPosition;
    timeInForce: TimeInForce;
    createdAt: number;
    orderId: string;
    filled: bigint;
    remainingQty: bigint;
    status: OrderStatus;
    averagePrice: bigint;
    fills: InMarketFillType[];
    depths: { asks: DepthType[], bids: DepthType[] };
}

export interface SpotInMarketOrder extends BaseInMarketOrder {
    marketType: MarketType.SPOT;
}

export interface PerpInMarketOrder extends BaseInMarketOrder {
    marketType: MarketType.PERP;
    leverage: number;
    margin: bigint;
    reduceOnly: boolean;
}

export type InMarketOrderType = SpotInMarketOrder | PerpInMarketOrder;

type NormalizeSpotOrderReturnType =
    Omit<
        SpotInMarketOrder,
        "entryPrice" |
        "quantity" |
        "remainingQty" |
        "filled" |
        "averagePrice" |
        "fills"
    > & {
        entryPrice: string;
        quantity: string;
        remainingQty: string;
        filled: string;
        averagePrice: string;
        fills: FillType[];
    };

type NormalizePerpOrderReturnType =
    Omit<
        PerpInMarketOrder,
        "entryPrice" |
        "quantity" |
        "margin" |
        "remainingQty" |
        "filled" |
        "averagePrice" |
        "fills"
    > & {
        entryPrice: string;
        quantity: string;
        margin: string;
        remainingQty: string;
        filled: string;
        averagePrice: string;
        fills: FillType[];
    };

export type NormalizeOrderReturnType = NormalizeSpotOrderReturnType | NormalizePerpOrderReturnType;


export type IncomingOrderType = BaseSpotOrderType | BasePerpOrderType;


export interface BaseSpotOrderType extends BaseOrderType {
    marketType: MarketType.SPOT;
}

export interface BasePerpOrderType extends BaseOrderType {
    marketType: MarketType.PERP;
    leverage: number;
    margin: string;
    reduceOnly: boolean;
}
