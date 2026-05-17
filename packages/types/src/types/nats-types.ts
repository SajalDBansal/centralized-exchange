import { BaseAssetType, BaseOrderType, DepthType, FillType, MarketSymbolType, OrderStatus, QuoteAssetType, ReturnBalanceType } from "./base";
import { FutureOrderType, SpotOrderType } from "./spot";

export type NatsIncomingSubjectTypes = (typeof NATS_INCOMING_SUBJECT)[keyof typeof NATS_INCOMING_SUBJECT];

export enum NATS_INCOMING_SUBJECT {
    ORDER_CREATE = "engine.order.create",
    ORDER_CANCEL = "engine.order.cancel",
    ORDER_OPEN_ORDERS = "engine.order.openOrders",
    ORDER_GET = "engine.order.get",
    ON_RAMP = "engine.ramp.on",
    BALANCE_GET = "engine.balance.get",
    DEPTH_GET = "engine.depth.get",
    HEALTH_CHECK = "engine.health.check",
}

export type Handler<TReq, TRes> = (
    subject: NatsIncomingSubjectTypes,
    data: TReq
) => Promise<TRes>;

// --------------------------------------------------------
export type CreateOrderPayload = BaseOrderType;

export type CancelOrderPayload = {
    userId: string;
    orderId: string;
};

export type GetUserOpenOrdersPayload = {
    userId: string;
    market: MarketSymbolType;
}

export type GetOrderByIdPayload = {
    userId: string;
    orderId: string;
}

export type OnRampPayload = {
    userId: string;
    asset: BaseAssetType | QuoteAssetType;
    amount: bigint;
}

export type GetUserBalancesPayload = {
    userId: string
}

export type GetDepthPayload = {
    market: MarketSymbolType;
}

export type HealthCheckPayload = {
    message: string;
}

export type PayloadToEngineType =
    CreateOrderPayload
    | CancelOrderPayload
    | GetUserOpenOrdersPayload
    | GetOrderByIdPayload
    | OnRampPayload
    | GetUserBalancesPayload
    | GetDepthPayload
    | HealthCheckPayload;

// --------------------------------------------------------

export type PayloadToBackendType =
    BaseReturnPayload
    | CreateOrderReturnPayload
    | CancelOrderReturnPayload
    | GetUserOpenOrdersReturnPayload
    | GetOrderByIdReturnPayload
    | OnRampReturnPayload
    | GetUserBalancesReturnPayload
    | GetDepthReturnPayload;


export interface BaseReturnPayload {
    success: boolean;
    message: string;
    userId: string;
}

export interface CreateOrderReturnPayload extends BaseReturnPayload {
    orderId: string;
    status: OrderStatus;
    averagePrice: bigint;
    executedQty: bigint;
    remainingQty: bigint;
    fills: FillType[];
    depths: { asks: DepthType[], bids: DepthType[] };
}

export interface CancelOrderReturnPayload extends BaseReturnPayload {
    orderId: string
}

export interface GetUserOpenOrdersReturnPayload extends BaseReturnPayload {
    orders: SpotOrderType[] | FutureOrderType[];
}

export interface GetOrderByIdReturnPayload extends BaseReturnPayload {
    order: SpotOrderType | FutureOrderType;
}

export interface OnRampReturnPayload extends BaseReturnPayload {
    asset: BaseAssetType | QuoteAssetType;
    total: bigint;
    locked: bigint;
}

export interface GetUserBalancesReturnPayload extends BaseReturnPayload {
    balances: ReturnBalanceType
}

export interface GetDepthReturnPayload extends BaseReturnPayload {
    market: MarketSymbolType;
    depths: { asks: DepthType[], bids: DepthType[] }
}