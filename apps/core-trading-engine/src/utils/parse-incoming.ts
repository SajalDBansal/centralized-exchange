import { IncomingOrderType, InMarketOrderType, MarketType, normalizeIncomingOrderType, NormalizeOnRampType, NormalizeOrderReturnType, OnRampPayload } from "@workspace/types";
import { EVENT_REJECT_CODES } from "@workspace/types";
import { RejectError } from "./error";

// TODO: Bigint do not support decimals, so we need to handle that in the future if needed. For now we are assuming that the input will be in the form of string and will be a valid number.
export function parseBigInt(
    value: string,
    code: EVENT_REJECT_CODES,
    field: string
): bigint {

    if (typeof value !== "string") {
        throw new RejectError(code, `${field} must be string`);
    }

    if (!/^\d*\.?\d*$/.test(value)) {
        throw new RejectError(code, `Invalid ${field}`);
    }

    try {
        return BigInt(value);
    } catch {
        throw new RejectError(code, `Invalid ${field}`);
    }
}

export function normalizeOrderIncoming(order: IncomingOrderType): normalizeIncomingOrderType {
    return {
        ...order,

        quantity: parseBigInt(
            order.quantity,
            EVENT_REJECT_CODES.INVALID_QUANTITY,
            "quantity"
        ),

        entryPrice:
            typeof order.entryPrice !== "undefined"
                ? parseBigInt(
                    order.entryPrice,
                    EVENT_REJECT_CODES.INVALID_PRICE,
                    "price"
                )
                : undefined,

        margin:
            "margin" in order && typeof (order as any).margin !== "undefined"
                ? parseBigInt(
                    (order as any).margin,
                    EVENT_REJECT_CODES.INVALID_MARGIN,
                    "margin"
                )
                : undefined
    };
}

export function normalizeOnRampPayload(payload: OnRampPayload): NormalizeOnRampType {

    return {
        ...payload,

        amount: parseBigInt(
            payload.amount,
            EVENT_REJECT_CODES.INVALID_AMOUNT,
            "amount"
        )
    }
}

export function normalizeOrderReturn(order: InMarketOrderType): NormalizeOrderReturnType {

    if (order.marketType === MarketType.PERP) {

        return {
            ...order,
            quantity: order.quantity.toString(),
            remainingQty: order.remainingQty.toString(),
            filled: order.filled.toString(),
            averagePrice: order.averagePrice.toString(),
            margin: order.margin.toString(),
            entryPrice:
                typeof order.entryPrice === "bigint"
                    ? order.entryPrice.toString()
                    : undefined
        };
    }

    return {
        ...order,
        quantity: order.quantity.toString(),
        remainingQty: order.remainingQty.toString(),
        filled: order.filled.toString(),
        averagePrice: order.averagePrice.toString(),
        entryPrice:
            typeof order.entryPrice === "bigint"
                ? order.entryPrice.toString()
                : undefined
    };
}