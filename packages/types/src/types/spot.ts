import { BaseOrderType, FillType, MarketType, OrderStatus } from "./base"


interface BaseInMarketOrder {
    orderId: string;
    filled: bigint;
    status: OrderStatus;
    fills: FillType[];
}

export interface SpotInMarketOrder
    extends BaseInMarketOrder,
    BaseSpotOrderType { }

export interface PerpInMarketOrder
    extends BaseInMarketOrder,
    BasePerpOrderType { }

export type InMarketOrderType =
    | SpotInMarketOrder
    | PerpInMarketOrder;


export type IncomingOrderType =
    | BaseSpotOrderType
    | BasePerpOrderType;


export interface BaseSpotOrderType extends BaseOrderType {
    marketType: MarketType.SPOT;
}

export interface BasePerpOrderType extends BaseOrderType {
    marketType: MarketType.PERP;
    leverage: number;
    margin: bigint;
    reduceOnly?: boolean;
}