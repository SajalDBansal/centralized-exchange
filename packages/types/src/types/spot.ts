import { BaseOrderType, OrderStatus } from "./base"

export interface SpotOrderType extends BaseOrderType {
    orderId: string,
    filled: bigint;
    status: OrderStatus;
}

export interface FutureOrderType extends BaseOrderType {
    orderId: string,
    margin: bigint;
    filled: bigint;
    status: OrderStatus;
    reduceOnly: boolean;
}