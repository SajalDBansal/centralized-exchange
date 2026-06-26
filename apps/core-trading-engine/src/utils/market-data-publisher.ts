import { RedisPublisher } from "@workspace/redis-streams";
import {
    CancelOrderReturnPayload,
    createEmptyTicker,
    CreateOrderReturnPayload,
    DepthUpdateEvent,
    FillType,
    IndexPriceUpdateReturnPayload,
    MARKET_DATA_REDIS_CHANNEL,
    MarketDataEvent,
    OrderbookData,
    PriceUpdateEvent,
    serializeMarketDataEvent,
    TickerUpdateEvent,
} from "@workspace/types";

type OrderMutationResult = CreateOrderReturnPayload | CancelOrderReturnPayload;

export const buildOrderMarketDataEvents = (
    result: OrderMutationResult,
    orderbook: OrderbookData
): MarketDataEvent[] => {
    const order = result.data?.order;

    if (!order) {
        return [];
    }

    const depthEvent: DepthUpdateEvent = {
        type: "depth.update",
        stream: "depth",
        marketId: order.marketId,
        eventTs: result.timestamp,
        seq: result.eventId,
        data: orderbook,
    };

    const latestFill = getLatestFill(order.fills);

    if (!latestFill) {
        return [depthEvent];
    }

    const priceEvent: PriceUpdateEvent = {
        type: "price.update",
        stream: "price",
        marketId: order.marketId,
        eventTs: result.timestamp,
        data: { lastPrice: latestFill.price },
    };

    const tickerEvent: TickerUpdateEvent = {
        type: "ticker.update",
        stream: "ticker",
        marketId: order.marketId,
        eventTs: result.timestamp,
        data: {
            ...createEmptyTicker(latestFill.price),
            volume24h: sumFillQuantity(order.fills),
        },
    };

    return [depthEvent, priceEvent, tickerEvent];
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

export const publishMarketDataEvents = async (events: MarketDataEvent[]) => {
    for (const event of events) {
        await RedisPublisher.publishPubSub(
            MARKET_DATA_REDIS_CHANNEL,
            serializeMarketDataEvent(event)
        );
    }
};

function getLatestFill(fills: FillType[]) {
    return fills.reduce<FillType | undefined>((latest, fill) => {
        if (!latest) {
            return fill;
        }

        return fill.timestamp >= latest.timestamp ? fill : latest;
    }, undefined);
}

function sumFillQuantity(fills: FillType[]) {
    const total = fills.reduce((sum, fill) => {
        const quantity = Number(fill.qty);
        return Number.isFinite(quantity) ? sum + quantity : sum;
    }, 0);

    return total.toString();
}
