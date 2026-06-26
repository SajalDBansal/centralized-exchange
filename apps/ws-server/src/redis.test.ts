import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
    MARKET_DATA_REDIS_CHANNEL,
    type MarketDataEvent,
    serializeMarketDataEvent,
    type PriceUpdateEvent,
} from "@workspace/types";

const mockSubscribe = jest.fn<(channel: string, listener: (message: string) => void) => Promise<void>>();
const mockUnsubscribe = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockQuit = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockCreateBlockingConnection = jest.fn<(...args: unknown[]) => Promise<{
    subscribe: typeof mockSubscribe;
    unsubscribe: typeof mockUnsubscribe;
    quit: typeof mockQuit;
}>>();

jest.mock("@workspace/redis-streams", () => ({
    RedisManager: {
        createBlockingConnection: mockCreateBlockingConnection,
    },
}));

describe("redis market data subscriber", () => {
    beforeEach(() => {
        mockSubscribe.mockReset();
        mockUnsubscribe.mockReset();
        mockQuit.mockReset();
        mockCreateBlockingConnection.mockReset();
        mockCreateBlockingConnection.mockResolvedValue({
            subscribe: mockSubscribe,
            unsubscribe: mockUnsubscribe,
            quit: mockQuit,
        });
    });

    it("bridges valid Redis pub/sub messages into the websocket gateway", async () => {
        const { connectRedisMarketDataSubscriber } = require("./redis") as typeof import("./redis");
        const publishToLocalClients = jest.fn<(event: MarketDataEvent) => number>(() => 1);

        await connectRedisMarketDataSubscriber({ publishToLocalClients });

        expect(mockCreateBlockingConnection).toHaveBeenCalledWith("market-data-pubsub");
        expect(mockSubscribe).toHaveBeenCalledWith(MARKET_DATA_REDIS_CHANNEL, expect.any(Function));

        const listener = mockSubscribe.mock.calls[0]?.[1];
        expect(listener).toBeDefined();

        const event: PriceUpdateEvent = {
            type: "price.update",
            stream: "price",
            marketId: "BTC_INR",
            eventTs: Date.now(),
            data: { lastPrice: "100" },
        };

        listener?.(serializeMarketDataEvent(event));
        listener?.("not-json");

        expect(publishToLocalClients).toHaveBeenCalledTimes(1);
        expect(publishToLocalClients).toHaveBeenCalledWith(event);
    });

    it("closes the Redis subscription", async () => {
        const { connectRedisMarketDataSubscriber } = require("./redis") as typeof import("./redis");
        const subscription = await connectRedisMarketDataSubscriber({
            publishToLocalClients: jest.fn<(event: MarketDataEvent) => number>(() => 1),
        });

        await subscription.close();

        expect(mockUnsubscribe).toHaveBeenCalledWith(MARKET_DATA_REDIS_CHANNEL);
        expect(mockQuit).toHaveBeenCalled();
    });
});
