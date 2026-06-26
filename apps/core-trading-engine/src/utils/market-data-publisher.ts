import {
    CancelOrderReturnPayload,
    CreateOrderReturnPayload,
    DepthUpdateEvent,
    FillStatus,
    FillType,
    IndexPriceUpdateReturnPayload,
    MarketDataEvent,
    PriceUpdateEvent,
    TickerUpdateEvent,
} from "@workspace/types";
import {
    addDecimalStrings,
    compareDecimalStrings,
    isZeroDecimalString,
    multiplyDecimalStrings,
    subtractDecimalStrings,
} from "./decimal-string";

type OrderMutationResult = CreateOrderReturnPayload | CancelOrderReturnPayload;

export const buildOrderMarketDataEvents = (
    result: OrderMutationResult,
    tickerAggregator = new MarketTickerAggregator()
): MarketDataEvent[] => {
    const order = result.data?.order;

    if (!order) {
        return [];
    }

    const events: MarketDataEvent[] = [];
    const hasDepthDelta = order.depths.bids.length > 0 || order.depths.asks.length > 0;

    if (hasDepthDelta) {
        const depthEvent: DepthUpdateEvent = {
            type: "depth.update",
            stream: "depth",
            marketId: order.marketId,
            eventTs: result.timestamp,
            seq: result.eventId,
            data: order.depths,
        };

        events.push(depthEvent);
    }

    const fills = sortFills(order.fills).filter((fill) => fill.status === FillStatus.TRADE);

    if (fills.length === 0) {
        return events;
    }

    return [
        ...events,
        ...fills.flatMap((fill): [PriceUpdateEvent, TickerUpdateEvent] => {
            const ticker = tickerAggregator.applyFill(fill);

            return [
                {
                    type: "price.update",
                    stream: "price",
                    marketId: fill.marketId,
                    eventTs: fill.timestamp,
                    tradeId: fill.tradeId,
                    data: {
                        lastPrice: fill.price,
                        lastQuantity: fill.qty,
                    },
                },
                {
                    type: "ticker.update",
                    stream: "ticker",
                    marketId: fill.marketId,
                    eventTs: fill.timestamp,
                    tradeId: fill.tradeId,
                    data: ticker,
                },
            ];
        }),
    ];
};

export const buildIndexPriceMarketDataEvents = (
    result: IndexPriceUpdateReturnPayload
): MarketDataEvent[] => {
    if (!result.data) {
        return [];
    }

    return [{
        type: "price.update",
        stream: "price",
        marketId: result.data.marketId,
        eventTs: result.timestamp,
        data: {
            lastPrice: result.data.indexPrice,
            indexPrice: result.data.indexPrice,
        },
    }];
};

type TickerTrade = {
    tradeId: string;
    timestamp: number;
    price: string;
    quantity: string;
    quoteVolume: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class MarketTickerAggregator {
    private readonly tradesByMarket = new Map<string, TickerTrade[]>();

    applyFill(fill: FillType) {
        const quoteVolume = multiplyDecimalStrings(fill.price, fill.qty);
        const trade: TickerTrade = {
            tradeId: fill.tradeId,
            timestamp: fill.timestamp,
            price: fill.price,
            quantity: fill.qty,
            quoteVolume,
        };
        const existingTrades = this.tradesByMarket.get(fill.marketId) ?? [];
        const cutoff = fill.timestamp - DAY_MS;
        const trades = [...existingTrades, trade]
            .filter((item) => item.timestamp >= cutoff)
            .sort(compareTrades);

        this.tradesByMarket.set(fill.marketId, trades);

        return this.toTickerData(trades, trade);
    }

    private toTickerData(trades: TickerTrade[], lastTrade: TickerTrade) {
        const open = trades[0]?.price ?? lastTrade.price;
        const high = trades.reduce(
            (currentHigh, trade) => compareDecimalStrings(trade.price, currentHigh) > 0 ? trade.price : currentHigh,
            lastTrade.price
        );
        const low = trades.reduce(
            (currentLow, trade) => compareDecimalStrings(trade.price, currentLow) < 0 ? trade.price : currentLow,
            lastTrade.price
        );
        const volume = trades.reduce((sum, trade) => addDecimalStrings(sum, trade.quantity), "0");
        const quoteVolume = trades.reduce((sum, trade) => addDecimalStrings(sum, trade.quoteVolume), "0");
        const priceChange = subtractDecimalStrings(lastTrade.price, open);

        return {
            lastPrice: lastTrade.price,
            lastQuantity: lastTrade.quantity,
            lastQuoteVolume: lastTrade.quoteVolume,
            priceChange24h: priceChange,
            priceChangePercent24h: calculatePriceChangePercent(priceChange, open),
            high24h: high,
            low24h: low,
            volume24h: volume,
            quoteVolume24h: quoteVolume,
        };
    }
}

function sortFills(fills: FillType[]) {
    return [...fills].sort(compareFills);
}

function compareFills(left: FillType, right: FillType) {
    if (left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
    }

    return compareBigIntStrings(left.tradeId, right.tradeId);
}

function compareTrades(left: TickerTrade, right: TickerTrade) {
    if (left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
    }

    return compareBigIntStrings(left.tradeId, right.tradeId);
}

function compareBigIntStrings(left: string, right: string) {
    const a = BigInt(left);
    const b = BigInt(right);

    if (a === b) {
        return 0;
    }

    return a > b ? 1 : -1;
}

function calculatePriceChangePercent(priceChange: string, open: string) {
    if (isZeroDecimalString(open)) {
        return "0";
    }

    const percentage = (Number(priceChange) / Number(open)) * 100;

    if (!Number.isFinite(percentage)) {
        return "0";
    }

    return trimFixed(percentage.toFixed(4));
}

function trimFixed(value: string) {
    const trimmed = value.replace(/\.?0+$/, "");

    return trimmed === "" || trimmed === "-0" ? "0" : trimmed;
}
