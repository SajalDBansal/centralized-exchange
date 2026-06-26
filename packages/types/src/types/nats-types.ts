import { Asset, DepthType, FillType, Market, MarketId, MarketType, OrderId, OrderStatus, ReturnBalanceType, UserId } from "./base";
import type { DatabaseWritePayload } from "./database-types";
import { MarketsType } from "./engine";
import type { MarketDataEvent } from "./market-data";
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
    MARKET_GET_ALL_ASSET = "engine.market.getAll.asset",
    MARKET_GET = "engine.market.get",
    MARKET_ADD = "engine.market.add",
    MARKET_UPDATE = "engine.market.update",
    MARKET_DELETE = "engine.market.delete",
    MARKET_ADD_ASSET = "engine.market.asset.add",
    INDEX_PRICE_UPDATE = "engine.market.indexPrice.update",
    FUNDING_SETTLE = "engine.market.funding.settle",
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
    assetId: string;
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

export type GetMarketByIdPayload = {
    marketId: MarketId;
}

export type AddMarketType = {
    id: MarketId;
    name: string;
    baseAssetId: string;
    quoteAssetId: string;
    maxLeverage: number;
    minQty: number;
    tickSize: number;
    lotSize: number;
    minNotional: number;
}

export type AddMarketPayload = {
    userId: UserId;
    market: AddMarketType;
}

export type UpdateMarketPayload = {
    userId: UserId;
    marketId: MarketId;
    market: Partial<AddMarketType>;
}

export type DeleteMarketPayload = {
    userId: UserId;
    marketId: MarketId;
}

export type AddMarketAssetPayload = {
    userId: UserId;
    asset: Asset;
    assetSide: "base" | "quote";
}

export type AddUserPayload = {
    userId: UserId;
}

export type IndexPriceUpdatePayload = {
    marketId: MarketId;
    indexPrice: string;
    timestamp: number;
}

export type FundingSettlePayload = {
    marketId: MarketId;
    indexPrice: string;
    markPrice: string;
    intervalSeconds: number;
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
    | GetMarketByIdPayload
    | AddMarketPayload
    | UpdateMarketPayload
    | DeleteMarketPayload
    | AddMarketAssetPayload
    | IndexPriceUpdatePayload
    | FundingSettlePayload
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
    | IndexPriceUpdateReturnPayload
    | FundingSettleReturnPayload
    | DeleteMarketReturnPayload;

export interface BaseReturnPayload {
    success: boolean;
    message: string;
    eventId: number;
    timestamp: number;
    code?: EVENT_REJECT_CODES;
    updates?: EngineReturnUpdates;
}

export type EngineReturnUpdates = {
    marketData?: MarketDataEvent[];
    database?: DatabaseWritePayload;
};

export interface BaseReturnPayloadWithUser extends BaseReturnPayload {
    userId: string;
}

export interface CreateOrderReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        order: NormalizeOrderReturnType;
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
        assetId: string;
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
        depths: { asks: DepthType[], bids: DepthType[] }
    }
}

export interface GetMarketsReturnPayload extends BaseReturnPayload {
    data?: {
        markets: { [k: string]: Market; };
    }
}

export interface GetAssetsReturnPayload extends BaseReturnPayload {
    data?: {
        assets: { [k: string]: Asset; };
    }
}

export interface GetMarketByIdReturnPayload extends BaseReturnPayload {
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

export interface IndexPriceUpdateReturnPayload extends BaseReturnPayload {
    data?: {
        marketId: MarketId;
        indexPrice: string;
        liquidatablePositionIds: string[];
        liquidationAttempts: number;
        liquidationFailures: number;
    }
}

export interface FundingSettleReturnPayload extends BaseReturnPayload {
    data?: {
        marketId: MarketId;
        fundingRateBps: string;
        payments: number;
        insuranceUsed: string;
        liquidatablePositionIds: string[];
    }
}
