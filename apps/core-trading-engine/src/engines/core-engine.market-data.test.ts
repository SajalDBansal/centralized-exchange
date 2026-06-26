import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
    EVENT_TO_ENGINE_SUBJECT,
    MARKET_DATA_REDIS_CHANNEL,
    MarketType,
    OrderSide,
    OrderType,
    parseMarketDataEvent,
    STPMode,
    TimeInForce,
} from "@workspace/types";

const mockPublishDatabaseEvent = jest.fn<(...args: unknown[]) => Promise<string>>(
    () => Promise.resolve("database-event")
);
const mockPublishPubSub = jest.fn<(channel: string, message: string) => Promise<number>>(
    () => Promise.resolve(1)
);

jest.mock("@workspace/redis-streams", () => ({
    RedisPublisher: {
        publishDatabaseEvent: mockPublishDatabaseEvent,
        publishPubSub: mockPublishPubSub,
    },
}));

describe("Engine market data publishing", () => {
    beforeEach(() => {
        mockPublishDatabaseEvent.mockClear();
        mockPublishPubSub.mockClear();
    });

    it("publishes depth, price, and ticker updates from a real spot order flow", async () => {
        const { Engine } = require("./core-engine") as typeof import("./core-engine");
        const engine = new Engine(join(
            tmpdir(),
            `cex-engine-market-data-${Date.now()}-${Math.random()}.json`
        ));

        await engine.process(EVENT_TO_ENGINE_SUBJECT.USER_ADD, { userId: "buyer" });
        await engine.process(EVENT_TO_ENGINE_SUBJECT.USER_ADD, { userId: "seller" });
        await engine.process(EVENT_TO_ENGINE_SUBJECT.ON_RAMP, {
            userId: "buyer",
            assetId: "INR",
            amount: "100000",
        });
        await engine.process(EVENT_TO_ENGINE_SUBJECT.ON_RAMP, {
            userId: "seller",
            assetId: "BTC",
            amount: "10",
        });

        mockPublishPubSub.mockClear();

        const sellResult = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, {
            ...spotOrder("seller", OrderSide.SELL),
            entryPrice: "100",
            quantity: "1",
        });

        expect(sellResult.success).toBe(true);
        expect(mockPublishPubSub).toHaveBeenCalledTimes(1);

        const restingDepth = parsePublishedEvents();
        expect(restingDepth).toEqual([
            expect.objectContaining({
                type: "depth.update",
                marketId: "BTC_INR",
                seq: sellResult.eventId,
                data: {
                    bids: [],
                    asks: [{ price: "100", quantity: "1" }],
                },
            }),
        ]);

        mockPublishPubSub.mockClear();

        const buyResult = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, {
            ...spotOrder("buyer", OrderSide.BUY),
            entryPrice: "100",
            quantity: "1",
        });

        expect(buyResult.success).toBe(true);
        expect(mockPublishPubSub).toHaveBeenCalledTimes(3);
        expect(mockPublishPubSub.mock.calls.every(([channel]) => channel === MARKET_DATA_REDIS_CHANNEL)).toBe(true);

        const events = parsePublishedEvents();
        expect(events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: "depth.update",
                marketId: "BTC_INR",
                seq: buyResult.eventId,
                data: { bids: [], asks: [] },
            }),
            expect.objectContaining({
                type: "price.update",
                marketId: "BTC_INR",
                data: { lastPrice: "100" },
            }),
            expect.objectContaining({
                type: "ticker.update",
                marketId: "BTC_INR",
                data: expect.objectContaining({
                    lastPrice: "100",
                    volume24h: "1",
                }),
            }),
        ]));
    });
});

function spotOrder(userId: string, side: OrderSide) {
    return {
        userId,
        marketId: "BTC_INR",
        marketType: MarketType.SPOT,
        side,
        type: OrderType.LIMIT,
        postOnly: false,
        stpMode: STPMode.CANCEL_TAKER,
        timeInForce: TimeInForce.GTC,
        createdAt: Date.now(),
    };
}

function parsePublishedEvents() {
    return mockPublishPubSub.mock.calls.map(([, message]) => {
        const event = parseMarketDataEvent(message as string);
        expect(event).not.toBeNull();
        return event;
    });
}
