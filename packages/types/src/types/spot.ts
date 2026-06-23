import { BaseOrderType, DepthType, FillType, InMarketFillType, MarketId, MarketType, OrderPosition, OrderSide, OrderStatus, OrderType, STPMode, TimeInForce } from "./base"

interface BaseInMarketOrder {
    entryPrice: bigint;
    quantity: bigint;
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

export interface OrderReservationLedger {
    allotted: bigint;
    used: bigint;
    released: bigint;
}

export interface SpotInMarketOrder extends BaseInMarketOrder {
    marketType: MarketType.SPOT;
    balanceLedger: OrderReservationLedger;
}

export interface PerpInMarketOrder extends BaseInMarketOrder {
    marketType: MarketType.PERP;
    leverage: number;
    margin: bigint;
    marginLedger: OrderReservationLedger;
    reduceOnly: boolean;
    liquidation?: boolean;
}

export type InMarketOrderType = SpotInMarketOrder | PerpInMarketOrder;

type NormalizeSpotOrderReturnType =
    Omit<
        SpotInMarketOrder,
        "entryPrice" |
        "quantity" |
        "balanceLedger" |
        "remainingQty" |
        "filled" |
        "averagePrice" |
        "fills"
    > & {
        entryPrice: string;
        quantity: string;
        balanceLedger: {
            allotted: string;
            used: string;
            released: string;
        };
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
        "marginLedger" |
        "remainingQty" |
        "filled" |
        "averagePrice" |
        "fills"
    > & {
        entryPrice: string;
        quantity: string;
        margin: string;
        marginLedger: {
            allotted: string;
            used: string;
            released: string;
        };
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
    reduceOnly: boolean;
    liquidation?: boolean;
}
