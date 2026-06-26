import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "@jest/globals";
import {
    EVENT_TO_ENGINE_SUBJECT,
    MarketType,
    OrderSide,
    OrderType,
    STPMode,
    TimeInForce,
} from "@workspace/types";

describe("Engine market data updates", () => {
    it("returns depth deltas, last traded price, ticker, and database updates from a real spot order flow", async () => {
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

        const sellResult = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, {
            ...spotOrder("seller", OrderSide.SELL),
            entryPrice: "100",
            quantity: "1",
        });

        expect(sellResult.success).toBe(true);
        const restingDepth = sellResult.updates?.marketData ?? [];
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

        const buyResult = await engine.process(EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE, {
            ...spotOrder("buyer", OrderSide.BUY),
            entryPrice: "100",
            quantity: "1",
        });

        expect(buyResult.success).toBe(true);
        const events = buyResult.updates?.marketData ?? [];
        expect(events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: "depth.update",
                marketId: "BTC_INR",
                seq: buyResult.eventId,
                data: { bids: [], asks: [{ price: "100", quantity: "0" }] },
            }),
            expect.objectContaining({
                type: "price.update",
                marketId: "BTC_INR",
                tradeId: "1",
                data: expect.objectContaining({
                    lastPrice: "100",
                    lastQuantity: "1",
                }),
            }),
            expect.objectContaining({
                type: "ticker.update",
                marketId: "BTC_INR",
                tradeId: "1",
                data: expect.objectContaining({
                    lastPrice: "100",
                    lastQuantity: "1",
                    lastQuoteVolume: "100",
                    volume24h: "1",
                    quoteVolume24h: "100",
                }),
            }),
        ]));
        expect(buyResult.updates?.database).toMatchObject({
            orders: expect.any(Array),
            trades: expect.arrayContaining([
                expect.objectContaining({
                    marketId: "BTC_INR",
                    price: "100",
                    quantity: "1",
                }),
            ]),
        });
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
