import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
    EVENT_TO_ENGINE_SUBJECT,
    EventSource,
    type MarketEvent,
} from "@workspace/types";

const mockPublishMarketEvent = jest.fn<(...args: unknown[]) => Promise<string>>(
    () => Promise.resolve("market-event")
);

jest.mock("@workspace/redis-streams", () => ({
    RedisPublisher: {
        publishMarketEvent: mockPublishMarketEvent,
    },
}));

describe("ws index poller", () => {
    beforeEach(() => {
        mockPublishMarketEvent.mockClear();
        const { resetLatestPricesForTests } = require("./index") as typeof import("./index");
        resetLatestPricesForTests();
    });

    it("parses raw Binance mark-price arrays and combined stream messages", () => {
        const { parseMarkPriceMessage } = require("./index") as typeof import("./index");

        expect(parseMarkPriceMessage(JSON.stringify([
            { E: 1000, s: "BTCUSDT", p: "101", i: "100" },
            { E: 1001, s: "ETHUSDT", p: "201", i: "200" },
            { E: "bad", s: "SOLUSDT", p: "31", i: "30" },
        ]))).toEqual([
            { E: 1000, s: "BTCUSDT", p: "101", i: "100" },
            { E: 1001, s: "ETHUSDT", p: "201", i: "200" },
        ]);

        expect(parseMarkPriceMessage(JSON.stringify({
            stream: "!markPrice@arr@1s",
            data: { E: 1002, s: "SOLUSDT", p: "31", i: "30" },
        }))).toEqual([
            { E: 1002, s: "SOLUSDT", p: "31", i: "30" },
        ]);

        expect(parseMarkPriceMessage(JSON.stringify({ data: "ignored" }))).toEqual([]);
    });

    it("publishes index updates for mapped Binance symbols and ignores unknown symbols", async () => {
        const { handlePrice } = require("./index") as typeof import("./index");

        await handlePrice({ E: 1234, s: "BTCUSDT", p: "101", i: "100" });
        await handlePrice({ E: 1235, s: "DOGEUSDT", p: "1", i: "1" });

        expect(mockPublishMarketEvent).toHaveBeenCalledTimes(1);
        expect(publishedEvent()).toMatchObject({
            backendId: "ws-index-poller",
            source: EventSource.WS,
            type: EVENT_TO_ENGINE_SUBJECT.INDEX_PRICE_UPDATE,
            payload: {
                marketId: "BTC_PERP",
                indexPrice: "100",
                timestamp: 1234,
            },
        });
        expect(typeof publishedEvent().requestId).toBe("string");
        expect(typeof publishedEvent().timestamp).toBe("number");
    });

    it("publishes funding settlement events from the latest mark and index prices", async () => {
        const { handlePrice, publishFundingSettlements } = require("./index") as typeof import("./index");

        await handlePrice({ E: 1234, s: "BTCUSDT", p: "101", i: "100" });
        mockPublishMarketEvent.mockClear();

        await publishFundingSettlements();

        expect(mockPublishMarketEvent).toHaveBeenCalledTimes(1);
        expect(publishedEvent()).toMatchObject({
            backendId: "ws-index-poller",
            source: EventSource.WS,
            type: EVENT_TO_ENGINE_SUBJECT.FUNDING_SETTLE,
            payload: {
                marketId: "BTC_PERP",
                indexPrice: "100",
                markPrice: "101",
                intervalSeconds: 3600,
            },
        });
    });
});

function publishedEvent(): MarketEvent {
    return mockPublishMarketEvent.mock.calls[0]?.[0] as MarketEvent;
}
