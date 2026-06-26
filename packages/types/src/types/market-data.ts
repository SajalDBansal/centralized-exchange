import type { DepthType, MarketId } from "./base";

export type MarketStream = "ticker" | "price" | "depth";

export type TickerData = {
    lastPrice: string;
    lastQuantity?: string;
    lastQuoteVolume?: string;
    priceChange24h: string;
    priceChangePercent24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    quoteVolume24h: string;
};

export type PriceData = {
    lastPrice: string;
    lastQuantity?: string;
    markPrice?: string;
    indexPrice?: string;
};

export type OrderbookData = {
    bids: DepthType[];
    asks: DepthType[];
};

export type TickerUpdateEvent = {
    type: "ticker.update";
    stream: "ticker";
    marketId: MarketId;
    eventTs: number;
    tradeId?: string;
    data: TickerData;
};

export type PriceUpdateEvent = {
    type: "price.update";
    stream: "price";
    marketId: MarketId;
    eventTs: number;
    tradeId?: string;
    data: PriceData;
};

export type DepthUpdateEvent = {
    type: "depth.update";
    stream: "depth";
    marketId: MarketId;
    eventTs: number;
    seq: number;
    data: OrderbookData;
};

export type MarketDataEvent =
    | TickerUpdateEvent
    | PriceUpdateEvent
    | DepthUpdateEvent;

export type MarketSnapshot = {
    marketId: MarketId;
    snapshotAt: number;
    orderbookSeq: number;
    price: PriceData;
    ticker: TickerData;
    orderbook: OrderbookData;
};

export type TickersSnapshot = {
    snapshotAt: number;
    tickers: TickerUpdateEvent[];
};

export type MarketEventCursor = {
    snapshotAt: number;
    lastTickerTsByMarket: Record<string, number>;
    lastPriceTsByMarket: Record<string, number>;
    lastDepthSeqByMarket: Record<string, number>;
};

export const normalizeMarketId = (marketId: string) => marketId.trim().toUpperCase();

export const streamKey = (stream: MarketStream, marketId: string) =>
    `${stream}:${normalizeMarketId(marketId)}`;

export const parseStreamKey = (value: string) => {
    const [stream, marketId, ...extra] = value.split(":");

    if (!isMarketStream(stream) || !marketId || extra.length > 0) {
        return null;
    }

    return { stream, marketId: normalizeMarketId(marketId) };
};

export const isMarketStream = (value: unknown): value is MarketStream =>
    value === "ticker" || value === "price" || value === "depth";

export const serializeMarketDataEvent = (event: MarketDataEvent) =>
    JSON.stringify(event);

export const parseMarketDataEvent = (value: string): MarketDataEvent | null => {
    try {
        const parsed = JSON.parse(value) as Partial<MarketDataEvent>;

        if (
            !parsed ||
            typeof parsed !== "object" ||
            typeof parsed.marketId !== "string" ||
            typeof parsed.eventTs !== "number" ||
            !isMarketStream(parsed.stream)
        ) {
            return null;
        }

        if (parsed.type === "ticker.update" && parsed.stream === "ticker" && isObject(parsed.data)) {
            return {
                ...parsed,
                marketId: normalizeMarketId(parsed.marketId),
            } as TickerUpdateEvent;
        }

        if (parsed.type === "price.update" && parsed.stream === "price" && isObject(parsed.data)) {
            return {
                ...parsed,
                marketId: normalizeMarketId(parsed.marketId),
            } as PriceUpdateEvent;
        }

        if (
            parsed.type === "depth.update" &&
            parsed.stream === "depth" &&
            typeof (parsed as Partial<DepthUpdateEvent>).seq === "number" &&
            isObject(parsed.data)
        ) {
            return {
                ...parsed,
                marketId: normalizeMarketId(parsed.marketId),
            } as DepthUpdateEvent;
        }

        return null;
    } catch {
        return null;
    }
};

export const createMarketEventCursor = (
    snapshot: Pick<MarketSnapshot, "snapshotAt" | "marketId" | "orderbookSeq">
): MarketEventCursor => ({
    snapshotAt: snapshot.snapshotAt,
    lastTickerTsByMarket: { [snapshot.marketId]: snapshot.snapshotAt },
    lastPriceTsByMarket: { [snapshot.marketId]: snapshot.snapshotAt },
    lastDepthSeqByMarket: { [snapshot.marketId]: snapshot.orderbookSeq },
});

export const shouldApplyMarketDataEvent = (
    event: MarketDataEvent,
    cursor: MarketEventCursor
) => {
    if (event.eventTs <= cursor.snapshotAt) {
        return false;
    }

    if (event.type === "ticker.update") {
        const lastTs = cursor.lastTickerTsByMarket[event.marketId] ?? 0;
        return event.eventTs > lastTs;
    }

    if (event.type === "price.update") {
        const lastTs = cursor.lastPriceTsByMarket[event.marketId] ?? 0;
        return event.eventTs > lastTs;
    }

    const lastSeq = cursor.lastDepthSeqByMarket[event.marketId] ?? 0;
    return event.seq > lastSeq;
};

export const markMarketDataEventApplied = (
    event: MarketDataEvent,
    cursor: MarketEventCursor
) => {
    if (event.type === "ticker.update") {
        cursor.lastTickerTsByMarket[event.marketId] = event.eventTs;
        return;
    }

    if (event.type === "price.update") {
        cursor.lastPriceTsByMarket[event.marketId] = event.eventTs;
        return;
    }

    cursor.lastDepthSeqByMarket[event.marketId] = event.seq;
};

export const createEmptyTicker = (lastPrice = "0"): TickerData => ({
    lastPrice,
    priceChange24h: "0",
    priceChangePercent24h: "0",
    high24h: lastPrice,
    low24h: lastPrice,
    volume24h: "0",
    quoteVolume24h: "0",
});

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}
