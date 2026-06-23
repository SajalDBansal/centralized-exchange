import { Asset, DepthType, FillType, IncomingOrderType, InMarketFillType, InMarketOrderType, Market, MarketType, normalizeIncomingOrderType, NormalizeOnRampType, NormalizeOrderReturnType, OnRampPayload, OrderSide } from "@workspace/types";
import { EVENT_REJECT_CODES } from "@workspace/types";
import { RejectError } from "./error";

export function precisionMultiplier(precision: number): bigint {
    if (!Number.isInteger(precision) || precision < 0) {
        throw new RejectError(EVENT_REJECT_CODES.INVALID_AMOUNT, "Invalid asset precision");
    }

    return 10n ** BigInt(precision);
}

export function parseBigInt(value: string, precision: number, code: EVENT_REJECT_CODES, field: string): bigint {
    if (typeof value !== "string") {
        throw new RejectError(code, `${field} must be string`);
    }

    const normalized = value.trim();
    const negative = normalized.startsWith("-");

    if (negative) {
        throw new RejectError(code, `${field} cannot be negative`);
    }

    if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(normalized)) {
        throw new RejectError(code, `Invalid ${field}`);
    }

    const [integerPart = "0", decimalPart = ""] = normalized.split(".");

    if (decimalPart.length > precision) {
        throw new RejectError(code, `${field} exceeds ${precision} decimal places`);
    }

    const fractionalPart = decimalPart.padEnd(precision, "0").slice(0, precision);
    const safeIntegerPart = integerPart === "" ? "0" : integerPart;
    const combined = safeIntegerPart + fractionalPart;

    try {
        return BigInt(combined);
    } catch {
        throw new RejectError(code, `Invalid ${field}`);
    }
}

export function formatBigInt(value: bigint, precision: number): string {
    const multiplier = precisionMultiplier(precision);
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const integerPart = absolute / multiplier;
    const fractionalPart = absolute % multiplier;

    if (precision === 0 || fractionalPart === 0n) {
        return `${negative ? "-" : ""}${integerPart.toString()}`;
    }

    const fraction = fractionalPart.toString().padStart(precision, "0").replace(/0+$/, "");

    return `${negative ? "-" : ""}${integerPart.toString()}.${fraction}`;
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
    if (denominator <= 0n) {
        throw new RejectError(EVENT_REJECT_CODES.INTERNAL_ERROR, "Invalid denominator");
    }

    return (numerator + denominator - 1n) / denominator;
}

export function quoteNotional(quantity: bigint, price: bigint, market: Market): bigint {
    return ceilDiv(quantity * price, precisionMultiplier(market.baseAsset.precision));
}

export function perpMargin(quantity: bigint, price: bigint, leverage: number, market: Market): bigint {
    return ceilDiv(quoteNotional(quantity, price, market), BigInt(leverage));
}

export function bufferedPerpMargin(quantity: bigint, price: bigint, leverage: number, market: Market): bigint {
    return ceilDiv(perpMargin(quantity, price, leverage, market) * 105n, 100n);
}

export function normalizeOrderIncoming(order: IncomingOrderType, market: Market): normalizeIncomingOrderType {
    return {
        ...order,

        quantity: parseBigInt(order.quantity, market.baseAsset.precision, EVENT_REJECT_CODES.INVALID_QUANTITY, "quantity"),

        entryPrice: parseBigInt(order.entryPrice, market.quoteAsset.precision, EVENT_REJECT_CODES.INVALID_PRICE, "price"),

        margin: 0n,
    };
}

export function normalizeOnRampPayload(payload: OnRampPayload, asset: Asset): NormalizeOnRampType {

    return {
        ...payload,
        amount: parseBigInt(payload.amount, asset.precision, EVENT_REJECT_CODES.INVALID_AMOUNT, "amount")
    }
}

export function normalizeOrderReturn(order: InMarketOrderType, market?: Market): NormalizeOrderReturnType {
    const basePrecision = market?.baseAsset.precision;
    const quotePrecision = market?.quoteAsset.precision;
    const fills = order.fills.map((fill) => normalizeFillReturn(fill, market));
    const depths = {
        asks: order.depths.asks.map((depth) => normalizeDepthReturn(depth, market)),
        bids: order.depths.bids.map((depth) => normalizeDepthReturn(depth, market)),
    };

    if (order.marketType === MarketType.PERP) {

        return {
            ...order,
            fills,
            depths,
            quantity: formatMaybe(order.quantity, basePrecision),
            remainingQty: formatMaybe(order.remainingQty, basePrecision),
            filled: formatMaybe(order.filled, basePrecision),
            averagePrice: formatMaybe(order.averagePrice, quotePrecision),
            margin: formatMaybe(order.margin, quotePrecision),
            marginLedger: {
                allotted: formatMaybe(order.marginLedger.allotted, quotePrecision),
                used: formatMaybe(order.marginLedger.used, quotePrecision),
                released: formatMaybe(order.marginLedger.released, quotePrecision),
            },
            entryPrice: formatMaybe(order.entryPrice, quotePrecision)

        };
    }

    const { margin: _margin, ...spotOrder } = order as InMarketOrderType & { margin?: bigint };

    return {
        ...spotOrder,
        fills,
        depths,
        quantity: formatMaybe(order.quantity, basePrecision),
        balanceLedger: {
            allotted: formatMaybe(order.balanceLedger.allotted, order.side === OrderSide.BUY ? quotePrecision : basePrecision),
            used: formatMaybe(order.balanceLedger.used, order.side === OrderSide.BUY ? quotePrecision : basePrecision),
            released: formatMaybe(order.balanceLedger.released, order.side === OrderSide.BUY ? quotePrecision : basePrecision),
        },
        remainingQty: formatMaybe(order.remainingQty, basePrecision),
        filled: formatMaybe(order.filled, basePrecision),
        averagePrice: formatMaybe(order.averagePrice, quotePrecision),
        entryPrice: formatMaybe(order.entryPrice, quotePrecision)
    } as NormalizeOrderReturnType;
}

function normalizeFillReturn(fill: InMarketFillType, market?: Market): FillType {
    return {
        ...fill,
        price: formatMaybe(fill.price, market?.quoteAsset.precision),
        qty: formatMaybe(fill.qty, market?.baseAsset.precision),
        tradeId: fill.tradeId.toString(),
    };
}

function normalizeDepthReturn(depth: DepthType, market?: Market): DepthType {
    const price = BigInt(depth.price);
    const quantity = BigInt(depth.quantity);

    return {
        price: formatMaybe(price, market?.quoteAsset.precision),
        quantity: formatMaybe(quantity, market?.baseAsset.precision),
    };
}

function formatMaybe(value: bigint, precision?: number): string {
    return typeof precision === "number" ? formatBigInt(value, precision) : value.toString();
}
