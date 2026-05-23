import { OrderList, OrderNode } from "../orderList";
import { Asset, Market, MarketId, MarketType, OrderId, OrderPosition, OrderSide, OrderType, STPMode, TimeInForce, UserId } from "./base";
import { Tree } from "functional-red-black-tree";
import { CreateOrderPayload } from "./nats-types";


export interface AssetOrderbookType {
    market: MarketId;
    tickSize: number;
    lotSize: number;
    bids: Map<bigint, OrderList>;
    asks: Map<bigint, OrderList>;
    bidTree: Tree<bigint, boolean>;
    askTree: Tree<bigint, boolean>;
    orderMap: Map<OrderId, OrderNode>;
    userOrders: Map<UserId, Set<OrderId>>;
    lastTradePrice: bigint;
    indexPrice: bigint;
}

export interface UserPositionType {
    userId: string;
    positionId: string;
    orderId: string;
    market: MarketId;
    side: OrderSide;
    position: OrderPosition;
    leverage: number
    margin: bigint;
    averagePrice: bigint;
    quantity: bigint;
    liquidationPrice: bigint;
    entryPrice: bigint;
    upnl: bigint;
}

export type PositionsType = Map<MarketId, UserPosition>;
export type UserPosition = Map<UserId, UserPositionType>;

export type BaseBalanceType = Map<string, {
    total: bigint,
    locked: bigint;
}>

export type BalancesType = Map<UserId, BaseBalanceType>;

export type MarketsType = Map<MarketId, Market>;


export type normalizeIncomingOrderType = {
    quantity: bigint;
    entryPrice: bigint;
    margin: bigint;
    marketType: MarketType.SPOT;
    userId: string;
    marketId: string;
    side: OrderSide;
    type: OrderType;
    postOnly: boolean;
    stpMode: STPMode;
    position?: OrderPosition;
    timeInForce: TimeInForce;
    createdAt: number;
} | {
    quantity: bigint;
    entryPrice: bigint;
    margin: bigint;
    marketType: MarketType.PERP;
    leverage: number;
    reduceOnly?: boolean;
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

export type NormalizeOnRampType = {
    userId: string;
    assetId: string;
    amount: bigint;
}

export type EngineSnapshot = {
    eventSequenceId: number;
    balances: [string, [string, { total: string; locked: string; }][]][];
    markets: [string, Market][];
    positions: [string, [string, Record<string, unknown>][]][];
    orders: [string, Record<string, unknown>][];
    assets: [string, Asset][];
};