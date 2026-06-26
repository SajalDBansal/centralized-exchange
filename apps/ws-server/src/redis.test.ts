import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
    CONSUMER_GROUPS,
    CONSUMERS,
    EVENT_TO_ENGINE_SUBJECT,
    REDIS_STREAMS,
    type MarketDataEvent,
    type PriceUpdateEvent,
    type TradeResultEvent,
} from "@workspace/types";

const mockInitializeStreams = jest.fn<() => Promise<void>>();
const mockXReadGroup = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockXAck = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockQuit = jest.fn<() => Promise<void>>();
const mockCreateBlockingConnection = jest.fn<(...args: unknown[]) => Promise<{
    xReadGroup: typeof mockXReadGroup;
    quit: typeof mockQuit;
}>>();
const mockGetInstance = jest.fn<() => Promise<{
    xAck: typeof mockXAck;
}>>();

jest.mock("@workspace/redis-streams", () => ({
    initializeStreams: mockInitializeStreams,
    RedisManager: {
        createBlockingConnection: mockCreateBlockingConnection,
        getInstance: mockGetInstance,
    },
}));

describe("redis engine result subscriber", () => {
    beforeEach(() => {
        mockInitializeStreams.mockReset();
        mockXReadGroup.mockReset();
        mockXAck.mockReset();
        mockQuit.mockReset();
        mockCreateBlockingConnection.mockReset();
        mockGetInstance.mockReset();

        mockInitializeStreams.mockResolvedValue(undefined);
        mockCreateBlockingConnection.mockResolvedValue({
            xReadGroup: mockXReadGroup,
            quit: mockQuit,
        });
        mockGetInstance.mockResolvedValue({ xAck: mockXAck });
        mockXAck.mockResolvedValue(undefined);
        mockQuit.mockResolvedValue(undefined);
    });

    it("bridges market data updates from the engine result stream into the websocket gateway", async () => {
        const { connectRedisMarketDataSubscriber } = require("./redis") as typeof import("./redis");
        const publishToLocalClients = jest.fn<(event: MarketDataEvent) => number>(() => 1);
        const event: PriceUpdateEvent = {
            type: "price.update",
            stream: "price",
            marketId: "BTC_INR",
            eventTs: Date.now(),
            tradeId: "1",
            data: { lastPrice: "100", lastQuantity: "1" },
        };

        mockXReadGroup
            .mockResolvedValueOnce([{
                messages: [{
                    id: "1-0",
                    message: { data: JSON.stringify(resultWithMarketData([event])) },
                }],
            }])
            .mockResolvedValue(null);

        const subscription = await connectRedisMarketDataSubscriber({ publishToLocalClients });
        await eventually(() => expect(publishToLocalClients).toHaveBeenCalledWith(event));

        expect(mockInitializeStreams).toHaveBeenCalled();
        expect(mockCreateBlockingConnection).toHaveBeenCalledWith(
            expect.stringContaining(`${REDIS_STREAMS.ENGINE_RESULT}:${CONSUMER_GROUPS.WS_SERVER}:${CONSUMERS.WS_SERVER}`)
        );
        expect(mockXReadGroup).toHaveBeenCalledWith(
            CONSUMER_GROUPS.WS_SERVER,
            expect.stringContaining(CONSUMERS.WS_SERVER),
            [{ key: REDIS_STREAMS.ENGINE_RESULT, id: ">" }],
            { BLOCK: 1_000, COUNT: 100 }
        );
        expect(mockXAck).toHaveBeenCalledWith(REDIS_STREAMS.ENGINE_RESULT, CONSUMER_GROUPS.WS_SERVER, "1-0");

        await subscription.close();
        expect(mockQuit).toHaveBeenCalled();
    });

    it("ignores result messages without market data updates", async () => {
        const { connectRedisMarketDataSubscriber } = require("./redis") as typeof import("./redis");
        const publishToLocalClients = jest.fn<(event: MarketDataEvent) => number>(() => 1);

        mockXReadGroup
            .mockResolvedValueOnce([{
                messages: [{
                    id: "1-0",
                    message: { data: JSON.stringify(resultWithMarketData([])) },
                }],
            }])
            .mockResolvedValue(null);

        const subscription = await connectRedisMarketDataSubscriber({ publishToLocalClients });
        await eventually(() => expect(mockXAck).toHaveBeenCalledWith(REDIS_STREAMS.ENGINE_RESULT, CONSUMER_GROUPS.WS_SERVER, "1-0"));

        expect(publishToLocalClients).not.toHaveBeenCalled();
        await subscription.close();
    });
});

function resultWithMarketData(marketData: MarketDataEvent[]): TradeResultEvent {
    return {
        requestId: "request-1",
        backendId: "backend-1",
        sourceEventType: EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE,
        success: true,
        payload: {
            success: true,
            message: "ok",
            eventId: 1,
            timestamp: Date.now(),
            updates: { marketData },
        },
        updates: { marketData },
        timestamp: Date.now(),
    };
}

async function eventually(assertion: () => void) {
    const startedAt = Date.now();
    let lastError: unknown;

    while (Date.now() - startedAt < 1_000) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }

    throw lastError;
}
