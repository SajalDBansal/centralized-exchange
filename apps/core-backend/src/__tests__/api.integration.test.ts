process.env.JWT_ACCESS_TOKEN = "test-access-secret";
process.env.JWT_REFRESH_TOKEN = "test-refresh-secret";

import supertest from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
    EVENT_TO_ENGINE_SUBJECT,
    EventSource,
    MarketType,
    OrderPosition,
    OrderSide,
    OrderType,
    STPMode,
    TimeInForce,
} from "@workspace/types";

const mockRequest = jest.fn<(subject: unknown, payload?: unknown) => Promise<unknown>>();
const mockBackendRequest = jest.fn<(event: unknown) => Promise<unknown>>();

const mockPrisma = {
    user: {
        findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    session: {
        create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    order: {
        findMany: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    },
};

jest.mock("@workspace/nats-streams", () => ({
    NatsManager: {
        getInstance: jest.fn(() => Promise.resolve({ request: mockRequest })),
    },
}));

jest.mock("../utils/backendResponseRouter", () => ({
    backendRouter: {
        backendId: "backend-test",
        request: mockBackendRequest,
        startListener: jest.fn(),
        stop: jest.fn(),
    },
}));

jest.mock("@workspace/database", () => ({
    prisma: mockPrisma,
}));

describe("core backend API integration", () => {
    beforeEach(() => {
        mockRequest.mockReset();
        mockBackendRequest.mockReset();
        Object.values(mockPrisma.user).forEach((mock) => mock.mockReset());
        Object.values(mockPrisma.session).forEach((mock) => mock.mockReset());
        Object.values(mockPrisma.order).forEach((mock) => mock.mockReset());
    });

    it("signs up a user and registers it with the trading engine", async () => {
        mockPrisma.user.findFirst.mockResolvedValue(null);
        mockPrisma.user.create.mockResolvedValue({
            id: "user-1",
            username: "alice",
            email: "alice@example.com",
        });
        mockRequest.mockResolvedValue(success("User added"));

        const response = await supertest(buildApp())
            .post("/api/v1/auth/signup")
            .send({
                username: "alice",
                email: "alice@example.com",
                password: "Password1",
                confirmPassword: "Password1",
            })
            .expect(200);

        expect(response.body).toMatchObject({
            success: true,
            message: "User Created Successfuly",
        });
        expect(mockPrisma.user.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                username: "alice",
                email: "alice@example.com",
                isVerified: true,
            }),
        });
        expect(mockRequest).toHaveBeenCalledWith(
            EVENT_TO_ENGINE_SUBJECT.USER_ADD,
            { userId: "user-1" }
        );
    });

    it("rejects invalid signup payloads before hitting the database or engine", async () => {
        const response = await supertest(buildApp())
            .post("/api/v1/auth/signup")
            .send({
                username: "al",
                email: "not-an-email",
                password: "weak",
                confirmPassword: "different",
            })
            .expect(400);

        expect(response.body).toMatchObject({
            success: false,
            type: "VALIDATION_ERROR",
        });
        expect(mockPrisma.user.create).not.toHaveBeenCalled();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it("signs in with a valid password and stores a refresh session", async () => {
        const passwordHash = await bcrypt.hash("Password1", 10);
        mockPrisma.user.findFirst.mockResolvedValue({
            id: "user-1",
            username: "alice",
            email: "alice@example.com",
            passwordHash,
            isVerified: true,
            isArchived: false,
        });
        mockPrisma.session.create.mockResolvedValue({ id: "session-1" });

        const response = await supertest(buildApp())
            .post("/api/v1/auth/signin")
            .set("user-agent", "jest")
            .send({ username: "alice", password: "Password1" })
            .expect(200);

        expect(response.body).toMatchObject({
            success: true,
            token: expect.stringMatching(/^Bearer /),
            user: {
                id: "user-1",
                username: "alice",
                email: "alice@example.com",
            },
        });
        expect(response.headers["set-cookie"]).toEqual(
            expect.arrayContaining([expect.stringContaining("refreshToken=")])
        );
        expect(mockPrisma.session.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                userId: "user-1",
                userAgent: "jest",
                refreshTokenHash: expect.any(String),
            }),
        });
    });

    it("returns auth errors for protected routes without a bearer token", async () => {
        const response = await supertest(buildApp())
            .get("/api/v1/user/get-balance")
            .expect(403);

        expect(response.body).toMatchObject({
            success: false,
            type: "TOKEN_UNAVAILABLE",
        });
    });

    it("proxies user balance reads and on-ramp writes to the engine", async () => {
        mockRequest
            .mockResolvedValueOnce({
                ...success("Balances fetched"),
                userId: "user-1",
                data: {
                    balances: {
                        INR: { total: "1000", locked: "0" },
                    },
                },
            })
            .mockResolvedValueOnce({
                ...success("Balance added"),
                userId: "user-1",
                data: { assetId: "INR", total: "1100", locked: "0" },
            });

        await supertest(buildApp())
            .get("/api/v1/user/get-balance")
            .set("authorization", accessToken())
            .expect(200);

        await supertest(buildApp())
            .post("/api/v1/user/add-balance")
            .set("authorization", accessToken())
            .send({ assetId: "INR", amount: "100" })
            .expect(200);

        expect(mockRequest).toHaveBeenNthCalledWith(
            1,
            EVENT_TO_ENGINE_SUBJECT.BALANCE_GET,
            { userId: "user-1" }
        );
        expect(mockRequest).toHaveBeenNthCalledWith(
            2,
            EVENT_TO_ENGINE_SUBJECT.ON_RAMP,
            { userId: "user-1", assetId: "INR", amount: "100" }
        );
    });

    it.each([
        {
            name: "spot limit GTC with cancel-taker STP",
            body: orderBody({
                marketType: MarketType.SPOT,
                type: OrderType.LIMIT,
                side: OrderSide.BUY,
                stpMode: STPMode.CANCEL_TAKER,
                timeInForce: TimeInForce.GTC,
            }),
            expected: {
                marketType: MarketType.SPOT,
                type: OrderType.LIMIT,
                side: OrderSide.BUY,
                stpMode: STPMode.CANCEL_TAKER,
                timeInForce: TimeInForce.GTC,
            },
        },
        {
            name: "spot market IOC",
            body: orderBody({
                marketType: MarketType.SPOT,
                type: OrderType.MARKET,
                side: OrderSide.SELL,
                stpMode: STPMode.CANCEL_BOTH,
                timeInForce: TimeInForce.IOC,
            }),
            expected: {
                marketType: MarketType.SPOT,
                type: OrderType.MARKET,
                side: OrderSide.SELL,
                stpMode: STPMode.CANCEL_BOTH,
                timeInForce: TimeInForce.IOC,
            },
        },
        {
            name: "perp limit FOK long with cancel-maker STP",
            body: orderBody({
                marketId: "BTC_PERP",
                marketType: MarketType.PERP,
                type: OrderType.LIMIT,
                side: OrderSide.BUY,
                position: OrderPosition.LONG,
                leverage: 25,
                stpMode: STPMode.CANCEL_MAKER,
                timeInForce: TimeInForce.FOK,
            }),
            expected: {
                marketId: "BTC_PERP",
                marketType: MarketType.PERP,
                type: OrderType.LIMIT,
                side: OrderSide.BUY,
                position: OrderPosition.LONG,
                leverage: 25,
                stpMode: STPMode.CANCEL_MAKER,
                timeInForce: TimeInForce.FOK,
            },
        },
        {
            name: "perp market IOC short reduce-only",
            body: orderBody({
                marketId: "BTC_PERP",
                marketType: MarketType.PERP,
                type: OrderType.MARKET,
                side: OrderSide.SELL,
                position: OrderPosition.SHORT,
                reduceOnly: true,
                stpMode: STPMode.CANCEL_TAKER,
                timeInForce: TimeInForce.IOC,
            }),
            expected: {
                marketId: "BTC_PERP",
                marketType: MarketType.PERP,
                type: OrderType.MARKET,
                side: OrderSide.SELL,
                position: OrderPosition.SHORT,
                reduceOnly: true,
                timeInForce: TimeInForce.IOC,
            },
        },
    ])("creates $name orders with all API flags", async ({ body, expected }) => {
        mockBackendRequest.mockResolvedValue(engineResult({
            ...success("Order created successfully"),
            userId: "user-1",
            data: { order: { orderId: "order-1" } },
        }));

        await supertest(buildApp())
            .post("/api/v1/order")
            .set("authorization", accessToken())
            .send(body)
            .expect(200);

        expect(mockBackendRequest).toHaveBeenCalledWith(expect.objectContaining({
            source: EventSource.BACKEND,
            type: EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE,
            payload: expect.objectContaining({
                ...expected,
                userId: "user-1",
                entryPrice: "100",
                quantity: "1",
                postOnly: false,
            }),
        }));
        const payload = (mockBackendRequest.mock.calls[0]?.[0] as { payload?: { createdAt?: unknown } })?.payload;
        expect(typeof payload?.createdAt).toBe("number");
    });

    it("rejects invalid order flags before publishing to the engine", async () => {
        const response = await supertest(buildApp())
            .post("/api/v1/order")
            .set("authorization", accessToken())
            .send({
                ...orderBody(),
                stpMode: "NONE",
                timeInForce: "DAY",
            })
            .expect(400);

        expect(response.body).toMatchObject({
            success: false,
            type: "VALIDATION_ERROR",
        });
        expect(mockBackendRequest).not.toHaveBeenCalled();
    });

    it("cancels, fetches, lists open orders, and reads DB order history by authenticated user", async () => {
        mockBackendRequest
            .mockResolvedValueOnce(engineResult({
                ...success("Order canceled successfully"),
                userId: "user-1",
                data: { order: { orderId: "order-1" } },
            }))
            .mockResolvedValueOnce(engineResult({
                ...success("Order fetched"),
                userId: "user-1",
                data: { order: { orderId: "order-1" } },
            }))
            .mockResolvedValueOnce(engineResult({
                ...success("Open orders fetched"),
                userId: "user-1",
                data: { orders: [{ orderId: "order-2" }] },
            }));
        mockPrisma.order.findMany.mockResolvedValue([{ id: "db-order-1" }]);

        await supertest(buildApp())
            .delete("/api/v1/order/order-1")
            .set("authorization", accessToken())
            .expect(200);

        await supertest(buildApp())
            .get("/api/v1/order/order-1")
            .set("authorization", accessToken())
            .expect(200);

        await supertest(buildApp())
            .get("/api/v1/order/open/BTC_INR")
            .set("authorization", accessToken())
            .expect(200);

        const history = await supertest(buildApp())
            .get("/api/v1/order/all/BTC_INR")
            .set("authorization", accessToken())
            .expect(200);

        expect(history.body.orders).toEqual([{ id: "db-order-1" }]);
        expect(mockBackendRequest).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                source: EventSource.BACKEND,
                type: EVENT_TO_ENGINE_SUBJECT.ORDER_CANCEL,
                payload: { userId: "user-1", orderId: "order-1" },
            })
        );
        expect(mockBackendRequest).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                source: EventSource.BACKEND,
                type: EVENT_TO_ENGINE_SUBJECT.ORDER_GET,
                payload: { userId: "user-1", orderId: "order-1" },
            })
        );
        expect(mockBackendRequest).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                source: EventSource.BACKEND,
                type: EVENT_TO_ENGINE_SUBJECT.ORDER_OPEN_ORDERS,
                payload: { userId: "user-1", marketId: "BTC_INR" },
            })
        );
        expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
            where: { userId: "user-1", marketId: "BTC_INR" },
        });
    });

    it("covers market, depth, and engine health routes", async () => {
        const market = createMarket("BTC_INR");
        mockRequest.mockImplementation(async (subject, payload) => {
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL) {
                return { ...success("Markets fetched"), data: { markets: { BTC_INR: market } } };
            }
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL_ASSET) {
                return { ...success("Assets fetched"), data: { assets: { BTC: market.baseAsset } } };
            }
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_GET) {
                return { ...success("Market fetched"), data: { market } };
            }
            if (subject === EVENT_TO_ENGINE_SUBJECT.DEPTH_GET) {
                return {
                    ...success("Depth fetched"),
                    data: {
                        depths: {
                            bids: [{ price: "99", quantity: "1" }],
                            asks: [{ price: "101", quantity: "1" }],
                        },
                    },
                };
            }
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_ADD) {
                return { ...success("Market added"), userId: "1243", data: { market } };
            }
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_ADD_ASSET) {
                return { ...success("Asset added"), userId: "1243" };
            }
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_UPDATE) {
                return { ...success("Market updated"), userId: "1243", data: { market } };
            }
            if (subject === EVENT_TO_ENGINE_SUBJECT.MARKET_DELETE) {
                return { ...success("Market deleted"), userId: "1243", data: { marketId: "BTC_INR" } };
            }
            if (subject === EVENT_TO_ENGINE_SUBJECT.HEALTH_CHECK) {
                return success("Engine healthy");
            }

            throw new Error(`Unexpected subject ${String(subject)} with payload ${JSON.stringify(payload)}`);
        });

        await supertest(buildApp()).get("/api/v1/market").expect(200);
        await supertest(buildApp()).get("/api/v1/market/assets").expect(200);
        await supertest(buildApp()).get("/api/v1/market/BTC_INR").expect(200);
        await supertest(buildApp()).get("/api/v1/depth/BTC_INR").expect(200);
        await supertest(buildApp()).get("/api/v1/health/core-backend").expect(200);
        await supertest(buildApp()).get("/api/v1/health/market-engine").expect(200);

        await supertest(buildApp())
            .post("/api/v1/market")
            .set("authorization", accessToken())
            .send({
                name: "BTC_INR",
                baseAssetId: "BTC",
                quoteAssetId: "INR",
                maxLeverage: 50,
                minQty: 1,
                tickSize: 1,
                lotSize: 1,
                minNotional: 1,
            })
            .expect(200);

        await supertest(buildApp())
            .post("/api/v1/market/asset")
            .set("authorization", accessToken())
            .send({ asset: { symbol: "DOGE", precision: 2 }, assetSide: "base" })
            .expect(200);

        await supertest(buildApp())
            .put("/api/v1/market/BTC_INR")
            .set("authorization", accessToken())
            .send({ maxLeverage: 25 })
            .expect(200);

        await supertest(buildApp())
            .delete("/api/v1/market/BTC_INR")
            .set("authorization", accessToken())
            .expect(200);

        expect(mockRequest).toHaveBeenCalledWith(
            EVENT_TO_ENGINE_SUBJECT.MARKET_ADD,
            expect.objectContaining({
                userId: "1243",
                market: expect.objectContaining({ id: "BTC_INR" }),
            })
        );
        expect(mockRequest).toHaveBeenCalledWith(
            EVENT_TO_ENGINE_SUBJECT.DEPTH_GET,
            { marketId: "BTC_INR" }
        );
    });
});

function buildApp() {
    const { createServer } = require("../server") as typeof import("../server");
    const { default: appRouter } = require("../routers") as typeof import("../routers");
    const { errorMiddleware } = require("../middleware/error-handler") as typeof import("../middleware/error-handler");
    const app = createServer();
    app.use("/api/v1", appRouter);
    app.use(errorMiddleware);
    return app;
}

function accessToken(userId = "user-1", sessionId = "session-1") {
    return `Bearer ${jwt.sign({ userId, sessionId }, process.env.JWT_ACCESS_TOKEN!)}`;
}

function success(message: string) {
    return {
        success: true,
        eventId: 1,
        timestamp: 1000,
        message,
    };
}

function engineResult(payload: unknown) {
    return {
        requestId: "request-1",
        backendId: "backend-test",
        success: true,
        payload,
        timestamp: 1000,
    };
}

function orderBody(overrides: Record<string, unknown> = {}) {
    return {
        marketId: "BTC_INR",
        entryPrice: "100",
        quantity: "1",
        leverage: 1,
        side: OrderSide.BUY,
        marketType: MarketType.SPOT,
        type: OrderType.LIMIT,
        postOnly: false,
        reduceOnly: false,
        stpMode: STPMode.CANCEL_TAKER,
        timeInForce: TimeInForce.GTC,
        ...overrides,
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
