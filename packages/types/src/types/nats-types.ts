import { DepthType, FillType, Market, MarketId, MarketType, OrderId, OrderStatus, ReturnBalanceType, UserId } from "./base";
import { MarketsType } from "./engine";
import { EVENT_REJECT_CODES } from "./oms";
import { IncomingOrderType, InMarketOrderType, NormalizeOrderReturnType } from "./spot";

export type IncomingEventTypes = (typeof EVENT_TO_ENGINE_SUBJECT)[keyof typeof EVENT_TO_ENGINE_SUBJECT];

export enum EVENT_TO_ENGINE_SUBJECT {
    ORDER_CREATE = "engine.order.create",
    ORDER_CANCEL = "engine.order.cancel",
    ORDER_OPEN_ORDERS = "engine.order.openOrders",
    ORDER_GET = "engine.order.get",
    ON_RAMP = "engine.ramp.on",
    BALANCE_GET = "engine.balance.get",
    DEPTH_GET = "engine.depth.get",
    HEALTH_CHECK = "engine.health.check",
    MARKET_GET_ALL = "engine.market.getAll",
    MARKET_GET = "engine.market.get",
    MARKET_ADD = "engine.market.add",
    MARKET_UPDATE = "engine.market.update",
    MARKET_DELETE = "engine.market.delete",
    MARKET_ADD_ASSET = "engine.market.asset.add",
    USER_ADD = "engine.user.add"
}

export type Handler<TReq, TRes> = (
    subject: IncomingEventTypes,
    data: TReq
) => Promise<TRes>;

// --------------------------------------------------------
export type CreateOrderPayload = IncomingOrderType;

export type CancelOrderPayload = {
    userId: UserId;
    orderId: OrderId;
};

export type GetUserOpenOrdersPayload = {
    userId: UserId;
    marketId: MarketId;
}

export type GetOrderByIdPayload = {
    userId: UserId;
    orderId: OrderId;
}

export type OnRampPayload = {
    userId: UserId;
    asset: string;
    amount: string;
}

export type GetUserBalancesPayload = {
    userId: UserId
}

export type GetDepthPayload = {
    marketId: MarketId;
}

export type HealthCheckPayload = {
    message: string;
}

export type GetMarketsPayload = {
    userId: UserId;
}

export type GetMarketByIdPayload = {
    userId: UserId;
    marketId: MarketId;
}

export type AddMarketPayload = {
    userId: UserId;
    market: Market;
}

export type UpdateMarketPayload = {
    userId: UserId;
    marketId: MarketId;
    market: Partial<Market>;
}

export type DeleteMarketPayload = {
    userId: UserId;
    marketId: MarketId;
}

export type AddMarketAssetPayload = {
    userId: UserId;
    asset: string;
    assetSide: "base" | "quote";
}

export type AddUserPayload = {
    userId: UserId;
}

export type PayloadToEngineType =
    CreateOrderPayload
    | CancelOrderPayload
    | GetUserOpenOrdersPayload
    | GetOrderByIdPayload
    | OnRampPayload
    | GetUserBalancesPayload
    | GetDepthPayload
    | HealthCheckPayload
    | GetMarketsPayload
    | GetMarketByIdPayload
    | AddMarketPayload
    | UpdateMarketPayload
    | DeleteMarketPayload
    | AddMarketAssetPayload
    | AddUserPayload;
;

// --------------------------------------------------------

export type PayloadToBackendType =
    BaseReturnPayload
    | BaseReturnPayloadWithUser
    | CreateOrderReturnPayload
    | CancelOrderReturnPayload
    | GetUserOpenOrdersReturnPayload
    | GetOrderByIdReturnPayload
    | OnRampReturnPayload
    | GetUserBalancesReturnPayload
    | GetDepthReturnPayload
    | GetMarketsReturnPayload
    | GetMarketByIdReturnPayload
    | AddMarketReturnPayload
    | UpdateMarketReturnPayload
    | DeleteMarketReturnPayload;

export interface BaseReturnPayload {
    success: boolean;
    message: string;
    eventId: number;
    timestamp: number;
    code?: EVENT_REJECT_CODES;
}

export interface BaseReturnPayloadWithUser extends BaseReturnPayload {
    userId: string;
}

export interface CreateOrderReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        orderId: string;
        order: NormalizeOrderReturnType;
        status: OrderStatus;
        averagePrice: string;
        executedQty: string;
        remainingQty: string;
        fills: FillType[];
        depths: { asks: DepthType[], bids: DepthType[] };
    }
}

export interface CancelOrderReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        order: NormalizeOrderReturnType;
    }

}

export interface GetUserOpenOrdersReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        orders: NormalizeOrderReturnType[];
    }
}

export interface GetOrderByIdReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        order: NormalizeOrderReturnType;
    }
}

export interface OnRampReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        asset: string;
        total: string;
        locked: string;
    }
}

export interface GetUserBalancesReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        balances: ReturnBalanceType
    }
}

export interface GetDepthReturnPayload extends BaseReturnPayload {
    data?: {
        market: Market;
        depths: { asks: DepthType[], bids: DepthType[] }
    }
}

export interface GetMarketsReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        markets: { [k: string]: Market; };
    }
}

export interface GetMarketByIdReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        market: Market;
    }
}

export interface AddMarketReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        market: Market;
    }
}

export interface UpdateMarketReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        market: Market;
    }
}

export interface DeleteMarketReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        marketId: MarketId;
    }
}