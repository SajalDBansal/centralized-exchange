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
    eventId: string;
    timestamp: number;
    code?: EVENT_REJECT_CODES;
}

export interface BaseReturnPayloadWithUser extends BaseReturnPayload {
    userId: string;
}

export interface CreateOrderReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        orderId: string;
        order: InMarketOrderType;
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
        order: InMarketOrderType;
    }

}

export interface GetUserOpenOrdersReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        orders: InMarketOrderType[];
    }
}

export interface GetOrderByIdReturnPayload extends BaseReturnPayloadWithUser {
    data?: {
        order: InMarketOrderType;
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