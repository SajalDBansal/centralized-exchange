import { OrderList, OrderNode } from "../orderList";
import { Market, MarketId, OrderId, OrderSide, UserId } from "./base";
import { Tree } from "functional-red-black-tree";


export interface PerpAssetOrderbookType {
    market: MarketId;
    tickSize: bigint;
    lotSize: bigint;
    bids: Map<bigint, OrderList>;
    asks: Map<bigint, OrderList>;
    bidTree: Tree<bigint, boolean>;
    askTree: Tree<bigint, boolean>;
    orderMap: Map<OrderId, OrderNode>;
    userOrders: Map<UserId, Set<OrderId>>;
    lastTradePrice: bigint;
    indexPrice: bigint;
}

export type PerpOrderBookType = Map<MarketId, PerpAssetOrderbookType>;

export interface UserPositionType {
    userId: string;
    positionId: string;
    orderId: string;
    market: MarketId;
    side: OrderSide;
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