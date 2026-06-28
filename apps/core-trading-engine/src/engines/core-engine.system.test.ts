import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "@jest/globals";
import {
    EVENT_REJECT_CODES,
    EVENT_TO_ENGINE_SUBJECT,
    MarketType,
    OrderPosition,
    OrderSide,
    OrderStatus,
    OrderType,
    STPMode,
    TimeInForce,
} from "@workspace/types";
import type { Engine } from "./core-engine";

describe("core engine system flows", () => {
    it("runs spot limit, market, cancel, depth, and balances through the real engine", async () => {
        const engine = newEngine();
        await addUserWithBalances(engine, "buyer", { INR: "200000" });
        await addUserWithBalances(engine, "seller", { BTC: "2" });

        const restingBid = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "buyer",
            side: OrderSide.BUY,
            entryPrice: "90",
        }));
        const restingBidOrder = orderFrom(restingBid);
        expect(restingBidOrder.status).toBe(OrderStatus.OPEN);

        const cancel = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CANCEL, {
            userId: "buyer",
            orderId: restingBidOrder.orderId,
        });
        expect(orderFrom(cancel).status).toBe(OrderStatus.CANCELLED);
        expect((cancel as any).updates.marketData).toEqual([
            expect.objectContaining({
                type: "depth.update",
                data: { bids: [{ price: "90", quantity: "0" }], asks: [] },
            }),
        ]);

        const maker = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "seller",
            side: OrderSide.SELL,
            entryPrice: "100",
        }));
        expect(orderFrom(maker).status).toBe(OrderStatus.OPEN);

        const depthBefore = await engine.process(EVENT_TO_ENGINE_SUBJECT.DEPTH_GET, {
            marketId: "BTC_INR",
        });
        expect((depthBefore as any).data.depths).toEqual({
            bids: [],
            asks: [{ price: "100", quantity: "1" }],
        });

        const taker = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "buyer",
            side: OrderSide.BUY,
            type: OrderType.MARKET,
            timeInForce: TimeInForce.IOC,
            entryPrice: "100",
        }));
        const takerOrder = orderFrom(taker);
        expect(takerOrder.status).toBe(OrderStatus.FILLED);
        expect(takerOrder.fills).toHaveLength(1);

        const depthAfter = await engine.process(EVENT_TO_ENGINE_SUBJECT.DEPTH_GET, {
            marketId: "BTC_INR",
        });
        expect((depthAfter as any).data.depths).toEqual({ bids: [], asks: [] });

        const buyerBalances = await engine.process(EVENT_TO_ENGINE_SUBJECT.BALANCE_GET, {
            userId: "buyer",
        });
        const sellerBalances = await engine.process(EVENT_TO_ENGINE_SUBJECT.BALANCE_GET, {
            userId: "seller",
        });

        expect((buyerBalances as any).data.balances.BTC).toMatchObject({
            total: "1",
            locked: "0",
        });
        expect((buyerBalances as any).data.balances.INR.locked).toBe("0");
        expect((sellerBalances as any).data.balances.BTC).toMatchObject({
            total: "1",
            locked: "0",
        });
        expect((sellerBalances as any).data.balances.INR.total).toBe("99.99");
        expect((taker as any).updates.marketData).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: "depth.update" }),
            expect.objectContaining({ type: "price.update", data: expect.objectContaining({ lastPrice: "100" }) }),
            expect.objectContaining({ type: "ticker.update" }),
        ]));
        expect((taker as any).updates.database).toMatchObject({
            orders: expect.any(Array),
            trades: expect.any(Array),
        });
    });

    it("withdraws available funds without allowing locked order collateral to be removed", async () => {
        const engine = newEngine();
        await addUserWithBalances(engine, "buyer", { INR: "100" });

        const resting = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "buyer",
            side: OrderSide.BUY,
            entryPrice: "90",
        }));
        expect(orderFrom(resting).status).toBe(OrderStatus.OPEN);

        const blocked = await engine.process(EVENT_TO_ENGINE_SUBJECT.OFF_RAMP, {
            userId: "buyer",
            assetId: "INR",
            amount: "10",
        });
        expect(blocked.success).toBe(false);
        expect((blocked as any).code).toBe(EVENT_REJECT_CODES.INSUFFICIENT_BALANCE);

        const withdrawn = await engine.process(EVENT_TO_ENGINE_SUBJECT.OFF_RAMP, {
            userId: "buyer",
            assetId: "INR",
            amount: "9",
        });
        expect(withdrawn).toMatchObject({
            success: true,
            data: { assetId: "INR", total: "91", locked: "90.01" },
            updates: {
                database: {
                    assetTransactions: [expect.objectContaining({
                        type: "WITHDRAWAL",
                        status: "APPLIED",
                        amount: "9",
                    })],
                },
            },
        });
    });

    it("enforces FOK and IOC fill boundaries without resting leftover taker quantity", async () => {
        const engine = newEngine();
        await addUserWithBalances(engine, "buyer", { INR: "200000" });
        await addUserWithBalances(engine, "seller", { BTC: "2" });

        await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "seller",
            side: OrderSide.SELL,
            entryPrice: "100",
            quantity: "1",
        }));

        const fok = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "buyer",
            side: OrderSide.BUY,
            entryPrice: "100",
            quantity: "2",
            timeInForce: TimeInForce.FOK,
        }));
        const fokOrder = orderFrom(fok);
        expect(fokOrder.status).toBe(OrderStatus.CANCELLED);
        expect(fokOrder.filled).toBe("0");

        const ioc = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "buyer",
            side: OrderSide.BUY,
            entryPrice: "100",
            quantity: "2",
            timeInForce: TimeInForce.IOC,
        }));
        const iocOrder = orderFrom(ioc);
        expect(iocOrder.status).toBe(OrderStatus.PARTIAL_FILLED);
        expect(iocOrder.filled).toBe("1");
        expect(iocOrder.remainingQty).toBe("1");

        const buyerOpenOrders = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_OPEN_ORDERS, {
            userId: "buyer",
            marketId: "BTC_INR",
        });
        expect((buyerOpenOrders as any).data.orders).toEqual([]);
    });

    it("covers STP modes and post-only crossing protection", async () => {
        const cancelMakerEngine = newEngine();
        await addUserWithBalances(cancelMakerEngine, "self", { INR: "100000", BTC: "2" });

        await cancelMakerEngine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "self",
            side: OrderSide.SELL,
            entryPrice: "100",
        }));

        const cancelMaker = await cancelMakerEngine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "self",
            side: OrderSide.BUY,
            entryPrice: "100",
            stpMode: STPMode.CANCEL_MAKER,
        }));
        expect(orderFrom(cancelMaker)).toMatchObject({
            side: OrderSide.BUY,
            status: OrderStatus.OPEN,
        });

        const selfOpenOrders = await cancelMakerEngine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_OPEN_ORDERS, {
            userId: "self",
            marketId: "BTC_INR",
        });
        expect((selfOpenOrders as any).data.orders).toHaveLength(1);
        expect((selfOpenOrders as any).data.orders[0]).toMatchObject({ side: OrderSide.BUY });

        for (const stpMode of [STPMode.CANCEL_TAKER, STPMode.CANCEL_BOTH]) {
            const engine = newEngine();
            await addUserWithBalances(engine, "self", { INR: "100000", BTC: "2" });
            await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
                userId: "self",
                side: OrderSide.SELL,
                entryPrice: "100",
            }));

            const result = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
                userId: "self",
                side: OrderSide.BUY,
                entryPrice: "100",
                stpMode,
            }));

            expect(result.success).toBe(false);
            expect((result as any).code).toBe(EVENT_REJECT_CODES.STP_TRIGGERED);
        }

        const postOnlyEngine = newEngine();
        await addUserWithBalances(postOnlyEngine, "buyer", { INR: "100000" });
        await addUserWithBalances(postOnlyEngine, "seller", { BTC: "2" });
        await postOnlyEngine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "seller",
            side: OrderSide.SELL,
            entryPrice: "100",
        }));

        const postOnly = await postOnlyEngine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, spotOrder({
            userId: "buyer",
            side: OrderSide.BUY,
            entryPrice: "100",
            postOnly: true,
        }));

        expect(postOnly.success).toBe(false);
        expect((postOnly as any).code).toBe(EVENT_REJECT_CODES.POST_ONLY_WOULD_TRADE);
    });

    it.each([
        {
            name: "spot order cannot carry a perp position",
            payload: spotOrder({
                userId: "user-1",
                side: OrderSide.BUY,
                position: OrderPosition.LONG,
            }),
            code: EVENT_REJECT_CODES.INVALID_POSITION,
        },
        {
            name: "market order cannot use GTC",
            payload: spotOrder({
                userId: "user-1",
                side: OrderSide.BUY,
                type: OrderType.MARKET,
                timeInForce: TimeInForce.GTC,
            }),
            code: EVENT_REJECT_CODES.MARKET_ORDER_GTC,
        },
        {
            name: "quantity must meet minimum quantity",
            payload: spotOrder({
                userId: "user-1",
                side: OrderSide.BUY,
                quantity: "0.99",
            }),
            code: EVENT_REJECT_CODES.BELOW_MIN_QTY,
        },
        {
            name: "price must align with tick size",
            payload: spotOrder({
                userId: "user-1",
                side: OrderSide.BUY,
                entryPrice: "100.50",
            }),
            code: EVENT_REJECT_CODES.INVALID_TICK_SIZE,
        },
        {
            name: "perp leverage cannot exceed market max leverage",
            payload: perpOrder({
                userId: "user-1",
                side: OrderSide.BUY,
                position: OrderPosition.LONG,
                leverage: 51,
            }),
            code: EVENT_REJECT_CODES.LEVERAGE_EXCEEDED,
        },
        {
            name: "perp reduce-only requires an existing opposite position",
            payload: perpOrder({
                userId: "user-1",
                side: OrderSide.SELL,
                position: OrderPosition.SHORT,
                reduceOnly: true,
            }),
            code: EVENT_REJECT_CODES.REDUCE_ONLY_INVALID,
        },
        {
            name: "perp side must match position direction",
            payload: perpOrder({
                userId: "user-1",
                side: OrderSide.BUY,
                position: OrderPosition.SHORT,
            }),
            code: EVENT_REJECT_CODES.INVALID_POSITION,
        },
    ])("rejects boundary: $name", async ({ payload, code }) => {
        const engine = newEngine();
        await addUserWithBalances(engine, "user-1", { INR: "100000", BTC: "2", USD: "100000" });

        const result = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, payload as any);

        expect(result.success).toBe(false);
        expect((result as any).code).toBe(code);
    });

    it("runs perp matching, funding settlement, index updates, and liquidation execution", async () => {
        const engine = newEngine();
        await addUserWithBalances(engine, "long", { USD: "100000" });
        await addUserWithBalances(engine, "short", { USD: "100000" });
        await addUserWithBalances(engine, "keeper", { USD: "100000" });

        const shortMaker = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, perpOrder({
            userId: "short",
            side: OrderSide.SELL,
            position: OrderPosition.SHORT,
            entryPrice: "100",
            leverage: 50,
        }));
        expect(orderFrom(shortMaker).status).toBe(OrderStatus.OPEN);

        const longTaker = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, perpOrder({
            userId: "long",
            side: OrderSide.BUY,
            position: OrderPosition.LONG,
            type: OrderType.MARKET,
            timeInForce: TimeInForce.IOC,
            entryPrice: "100",
            leverage: 50,
        }));
        expect(orderFrom(longTaker)).toMatchObject({
            status: OrderStatus.FILLED,
            marketType: MarketType.PERP,
            margin: "2.1",
        });

        const funding = await engine.process(EVENT_TO_ENGINE_SUBJECT.FUNDING_SETTLE, {
            marketId: "BTC_PERP",
            indexPrice: "100",
            markPrice: "101",
            intervalSeconds: 3600,
        });
        expect(funding.success).toBe(true);
        expect((funding as any).data).toMatchObject({
            marketId: "BTC_PERP",
            fundingRateBps: "-1",
            payments: 2,
            insuranceUsed: "0",
        });

        const keeperBid = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, perpOrder({
            userId: "keeper",
            side: OrderSide.BUY,
            position: OrderPosition.LONG,
            entryPrice: "90",
            leverage: 10,
        }));
        expect(orderFrom(keeperBid).status).toBe(OrderStatus.OPEN);

        const liquidation = await engine.process(EVENT_TO_ENGINE_SUBJECT.INDEX_PRICE_UPDATE, {
            marketId: "BTC_PERP",
            indexPrice: "90",
            timestamp: Date.now(),
        });

        expect(liquidation.success).toBe(true);
        expect((liquidation as any).data).toMatchObject({
            marketId: "BTC_PERP",
            indexPrice: "90",
            liquidationAttempts: 1,
            liquidationFailures: 0,
        });
        expect((liquidation as any).data.liquidatablePositionIds).toHaveLength(1);
    });

    it("rejects invalid funding and index-price poller payload boundaries", async () => {
        const engine = newEngine();

        const invalidMarket = await engine.process(EVENT_TO_ENGINE_SUBJECT.INDEX_PRICE_UPDATE, {
            marketId: "UNKNOWN_PERP",
            indexPrice: "100",
            timestamp: Date.now(),
        });
        expect(invalidMarket.success).toBe(false);
        expect((invalidMarket as any).code).toBe(EVENT_REJECT_CODES.INVALID_MARKET);

        const invalidFundingInterval = await engine.process(EVENT_TO_ENGINE_SUBJECT.FUNDING_SETTLE, {
            marketId: "BTC_PERP",
            indexPrice: "100",
            markPrice: "101",
            intervalSeconds: 0,
        });
        expect(invalidFundingInterval.success).toBe(false);
        expect((invalidFundingInterval as any).code).toBe(EVENT_REJECT_CODES.INVALID_AMOUNT);
    });
});

function newEngine(): Engine {
    const { Engine: CoreEngine } = require("./core-engine") as typeof import("./core-engine");
    return new CoreEngine(join(
        tmpdir(),
        `cex-core-engine-system-${process.pid}-${Date.now()}-${Math.random()}.json`
    ));
}

async function addUserWithBalances(
    engine: Engine,
    userId: string,
    balances: Record<string, string>
) {
    await engine.process(EVENT_TO_ENGINE_SUBJECT.USER_ADD, { userId });

    for (const [assetId, amount] of Object.entries(balances)) {
        const result = await engine.process(EVENT_TO_ENGINE_SUBJECT.ON_RAMP, {
            userId,
            assetId,
            amount,
        });
        expect(result.success).toBe(true);
    }
}

function spotOrder(overrides: Record<string, unknown> = {}) {
    return {
        userId: "user-1",
        marketId: "BTC_INR",
        marketType: MarketType.SPOT,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        entryPrice: "100",
        quantity: "1",
        postOnly: false,
        stpMode: STPMode.CANCEL_TAKER,
        timeInForce: TimeInForce.GTC,
        createdAt: Date.now(),
        ...overrides,
    };
}

function perpOrder(overrides: Record<string, unknown> = {}) {
    return {
        userId: "user-1",
        marketId: "BTC_PERP",
        marketType: MarketType.PERP,
        side: OrderSide.BUY,
        position: OrderPosition.LONG,
        type: OrderType.LIMIT,
        entryPrice: "100",
        quantity: "1",
        leverage: 10,
        reduceOnly: false,
        postOnly: false,
        stpMode: STPMode.CANCEL_TAKER,
        timeInForce: TimeInForce.GTC,
        createdAt: Date.now(),
        ...overrides,
    };
}

function orderFrom(result: unknown): Record<string, any> {
    const order = (result as any).data?.order;
    expect(order).toBeDefined();
    return order;
}
