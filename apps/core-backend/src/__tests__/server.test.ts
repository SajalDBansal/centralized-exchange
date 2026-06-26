import supertest from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { EVENT_TO_ENGINE_SUBJECT } from "@workspace/types";
import { createServer } from "../server";
import { errorMiddleware } from "../middleware/error-handler";

const mockRequest = jest.fn<(subject: unknown, payload?: unknown) => Promise<unknown>>();

jest.mock("@workspace/nats-streams", () => ({
    NatsManager: {
        getInstance: jest.fn(() => Promise.resolve({ request: mockRequest })),
    },
}));

describe("market data routes", () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it("returns a market snapshot with timestamp and depth sequence", async () => {
        const market = createMarket("BTC_INR");

        mockRequest.mockImplementation(async (subject) => {
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_GET) {
                return {
                    success: true,
                    eventId: 10,
                    timestamp: 1000,
                    message: "Market fetched",
                    data: { market },
                };
            }

            if (subject === EVENT_TO_ENGINE_SUBJECT.DEPTH_GET) {
                return {
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
                };
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
        expect(mockRequest).toHaveBeenCalledWith(
            EVENT_TO_ENGINE_SUBJECT.MARKET_GET,
            { marketId: "BTC_INR" }
        );
        expect(mockRequest).toHaveBeenCalledWith(
            EVENT_TO_ENGINE_SUBJECT.DEPTH_GET,
            { marketId: "BTC_INR" }
        );
    });

    it("returns ticker placeholders for all markets", async () => {
        const markets = {
            BTC_INR: createMarket("BTC_INR"),
            ETH_USD: createMarket("ETH_USD"),
        };

        mockRequest.mockResolvedValue({
            success: true,
            eventId: 20,
            timestamp: 2000,
            message: "Markets fetched",
            data: { markets },
        });

        const response = await supertest(buildApp())
            .get("/api/v1/market/tickers")
            .expect(200);

        expect(response.body.data.tickers).toHaveLength(2);
        expect(response.body.data.tickers).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: "ticker.update", marketId: "BTC_INR" }),
            expect.objectContaining({ type: "ticker.update", marketId: "ETH_USD" }),
        ]));
        expect(typeof response.body.data.snapshotAt).toBe("number");
        expect(mockRequest).toHaveBeenCalledWith(EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL);
    });
});

function buildApp() {
    const { default: marketRouter } = require("../routers/market-router") as typeof import("../routers/market-router");
    const app = createServer();
    app.use("/api/v1/market", marketRouter);
    app.use(errorMiddleware);
    return app;
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
