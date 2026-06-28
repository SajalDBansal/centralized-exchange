import supertest from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EVENT_TO_ENGINE_SUBJECT, EventSource } from "@workspace/types";
import { createServer } from "../server";
import { errorMiddleware } from "../middleware/error-handler";

const mockBackendRequest = jest.fn<(event: unknown) => Promise<unknown>>();
const mockTickerCandleFindMany = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.mock("../utils/backendResponseRouter", () => ({
    backendRouter: {
        backendId: "backend-test",
        request: mockBackendRequest,
        startListener: jest.fn(),
        stop: jest.fn(),
    },
}));

jest.mock("@workspace/database", () => ({
    prisma: {
        marketTickerCandle: { findMany: mockTickerCandleFindMany },
    },
}));

describe("market data routes", () => {
    beforeEach(() => {
        mockBackendRequest.mockReset();
        mockTickerCandleFindMany.mockReset();
    });

    it("returns a market snapshot with timestamp and depth sequence", async () => {
        const market = createMarket("BTC_INR");

        mockBackendRequest.mockImplementation(async (value) => {
            const { type: subject } = value as { type: EVENT_TO_ENGINE_SUBJECT };
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_GET) {
                return engineResult({
                    success: true,
                    eventId: 10,
                    timestamp: 1000,
                    message: "Market fetched",
                    data: { market },
                });
            }

            if (subject === EVENT_TO_ENGINE_SUBJECT.DEPTH_GET) {
                return engineResult({
                    success: true,
                    eventId: 11,
                    timestamp: 1001,
                    message: "Depth fetched",
                    data: {
                        depths: {
                            bids: [{ price: "99", quantity: "1" }],
                            asks: [{ price: "101", quantity: "2" }],
                        },
                    },
                });
            }

            throw new Error(`Unexpected subject: ${subject}`);
        });

        const response = await supertest(buildApp())
            .get("/api/v1/market/btc_inr/snapshot")
            .expect(200);

        expect(response.body.data.market).toEqual(market);
        expect(response.body.data.snapshot).toMatchObject({
            marketId: "BTC_INR",
            orderbookSeq: 11,
            price: { lastPrice: "100" },
            ticker: { lastPrice: "100" },
            orderbook: {
                bids: [{ price: "99", quantity: "1" }],
                asks: [{ price: "101", quantity: "2" }],
            },
        });
        expect(typeof response.body.data.snapshot.snapshotAt).toBe("number");
        expect(mockBackendRequest).toHaveBeenCalledWith(expect.objectContaining({
            source: EventSource.BACKEND,
            type: EVENT_TO_ENGINE_SUBJECT.MARKET_GET,
            payload: { marketId: "BTC_INR" },
        }));
        expect(mockBackendRequest).toHaveBeenCalledWith(expect.objectContaining({
            source: EventSource.BACKEND,
            type: EVENT_TO_ENGINE_SUBJECT.DEPTH_GET,
            payload: { marketId: "BTC_INR" },
        }));
    });

    it("returns ticker placeholders for all markets", async () => {
        const markets = {
            BTC_INR: createMarket("BTC_INR"),
            ETH_USD: createMarket("ETH_USD"),
        };

        mockBackendRequest.mockResolvedValue(engineResult({
            success: true,
            eventId: 20,
            timestamp: 2000,
            message: "Markets fetched",
            data: { markets },
        }));

        const response = await supertest(buildApp())
            .get("/api/v1/market/tickers")
            .expect(200);

        expect(response.body.data.tickers).toHaveLength(2);
        expect(response.body.data.tickers).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: "ticker.update", marketId: "BTC_INR" }),
            expect.objectContaining({ type: "ticker.update", marketId: "ETH_USD" }),
        ]));
        expect(typeof response.body.data.snapshotAt).toBe("number");
        expect(mockBackendRequest).toHaveBeenCalledWith(expect.objectContaining({
            source: EventSource.BACKEND,
            type: EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL,
        }));
    });

    it("returns ascending ticker candles from the database", async () => {
        mockTickerCandleFindMany.mockResolvedValue([
            tickerCandle(new Date("2026-06-28T10:01:00.000Z"), "101", 2n),
            tickerCandle(new Date("2026-06-28T10:00:00.000Z"), "100", 1n),
        ]);

        const response = await supertest(buildApp())
            .get("/api/v1/market/btc_inr/candles?interval=1m&limit=60")
            .expect(200);

        expect(response.body.data).toMatchObject({
            marketId: "BTC_INR",
            interval: "1m",
            candles: [
                expect.objectContaining({ close: "100", lastTradeId: "1" }),
                expect.objectContaining({ close: "101", lastTradeId: "2" }),
            ],
        });
        expect(mockTickerCandleFindMany).toHaveBeenCalledWith({
            where: { marketId: "BTC_INR", interval: "1m" },
            orderBy: { bucketStart: "desc" },
            take: 60,
        });
    });
});

function buildApp() {
    const { default: marketRouter } = require("../routers/market-router") as typeof import("../routers/market-router");
    const app = createServer();
    app.use("/api/v1/market", marketRouter);
    app.use(errorMiddleware);
    return app;
}

function engineResult(payload: unknown) {
    return {
        requestId: "request-1",
        backendId: "backend-test",
        sourceEventType: EVENT_TO_ENGINE_SUBJECT.MARKET_GET,
        success: true,
        payload,
        timestamp: Date.now(),
    };
}

function createMarket(id: string) {
    const [base = "BASE", quote = "QUOTE"] = id.split("_");

    return {
        id,
        name: id,
        baseAsset: { id: base, symbol: base, precision: 2 },
        quoteAsset: { id: quote, symbol: quote, precision: 2 },
        maxLeverage: 50,
        minQty: 1,
        tickSize: 1,
        lotSize: 1,
        minNotional: 1,
    };
}

function tickerCandle(bucketStart: Date, close: string, lastTradeId: bigint) {
    return {
        marketId: "BTC_INR",
        interval: "1m",
        bucketStart,
        open: close,
        high: close,
        low: close,
        close,
        volume: "1",
        quoteVolume: close,
        tradeCount: 1,
        lastTradeId,
        createdAt: bucketStart,
        updatedAt: bucketStart,
    };
}
