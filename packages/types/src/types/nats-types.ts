import { DepthType, FillType, Market, MarketId, OrderId, OrderStatus, ReturnBalanceType, UserId } from "./base";
import { EVENT_REJECT_CODES } from "./oms";
import { IncomingOrderType, InMarketOrderType } from "./spot";

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
    amount: bigint;
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
    eventId: bigint;
    code?: EVENT_REJECT_CODES;
}

export interface BaseReturnPayloadWithUser extends BaseReturnPayload {
    userId: string;
}

export interface CreateOrderReturnPayload extends BaseReturnPayloadWithUser {
    orderId: string;
    order: InMarketOrderType;
    status: OrderStatus;
    averagePrice: bigint;
    executedQty: bigint;
    remainingQty: bigint;
    fills: FillType[];
    depths: { asks: DepthType[], bids: DepthType[] };
}

export interface CancelOrderReturnPayload extends BaseReturnPayloadWithUser {
    order: InMarketOrderType;
}

export interface GetUserOpenOrdersReturnPayload extends BaseReturnPayloadWithUser {
    orders: InMarketOrderType[];
}

export interface GetOrderByIdReturnPayload extends BaseReturnPayloadWithUser {
    order: InMarketOrderType;
}

export interface OnRampReturnPayload extends BaseReturnPayloadWithUser {
    asset: string;
    total: bigint;
    locked: bigint;
}

export interface GetUserBalancesReturnPayload extends BaseReturnPayloadWithUser {
    balances: ReturnBalanceType
}

export interface GetDepthReturnPayload extends BaseReturnPayload {
    market: Market;
    depths: { asks: DepthType[], bids: DepthType[] }
}