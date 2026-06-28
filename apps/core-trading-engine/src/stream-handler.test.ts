import { describe, expect, it, jest } from "@jest/globals";
import {
    AnyTradeResultEvent,
    EVENT_TO_ENGINE_SUBJECT,
    EventSource,
    MarketEvent,
} from "@workspace/types";
import { createEngineStreamHandler } from "./stream-handler";

describe("Redis engine stream handler", () => {
    it("processes backend commands and publishes their correlated result envelope", async () => {
        const engineResult = {
            success: true,
            message: "User added successfully",
            eventId: 42,
            timestamp: 1_000,
        };
        const process = jest.fn<(subject: unknown, payload?: unknown) => Promise<typeof engineResult>>(async () => engineResult);
        const publish = jest.fn<(event: AnyTradeResultEvent) => Promise<void>>(async () => undefined);
        const handler = createEngineStreamHandler({ process } as never, publish);
        const event: MarketEvent<EVENT_TO_ENGINE_SUBJECT.USER_ADD> = {
            requestId: "request-1",
            backendId: "backend-1",
            source: EventSource.BACKEND,
            type: EVENT_TO_ENGINE_SUBJECT.USER_ADD,
            payload: { userId: "user-1" },
            timestamp: 900,
        };

        await handler(event);

        expect(process).toHaveBeenCalledWith(EVENT_TO_ENGINE_SUBJECT.USER_ADD, { userId: "user-1" });
        expect(publish).toHaveBeenCalledWith(expect.objectContaining({
            requestId: "request-1",
            backendId: "backend-1",
            sourceEventType: EVENT_TO_ENGINE_SUBJECT.USER_ADD,
            success: true,
            payload: engineResult,
        }));
    });

    it("processes non-backend events without publishing an HTTP response", async () => {
        const process = jest.fn<(subject: unknown, payload?: unknown) => Promise<any>>(async () => ({
            success: true,
            message: "Index updated",
            eventId: 1,
            timestamp: 1_000,
        }));
        const publish = jest.fn<(event: AnyTradeResultEvent) => Promise<void>>(async () => undefined);
        const handler = createEngineStreamHandler({ process } as never, publish);
        const event: MarketEvent<EVENT_TO_ENGINE_SUBJECT.INDEX_PRICE_UPDATE> = {
            requestId: "poller-1",
            backendId: "ws-index-poller",
            source: EventSource.WS,
            type: EVENT_TO_ENGINE_SUBJECT.INDEX_PRICE_UPDATE,
            payload: { marketId: "BTC_PERP", indexPrice: "100", timestamp: 900 },
            timestamp: 900,
        };

        await handler(event);

        expect(process).toHaveBeenCalledTimes(1);
        expect(publish).not.toHaveBeenCalled();
    });
});
