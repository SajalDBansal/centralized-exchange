import {
    AnyMarketEvent,
    AnyTradeResultEvent,
    EventSource,
} from "@workspace/types";
import { RedisPublisher } from "@workspace/redis-streams";
import type { Engine } from "./engines/core-engine";

type EngineProcessor = Pick<Engine, "process">;
type ResultPublisher = (event: AnyTradeResultEvent) => Promise<unknown>;

/** Converts a market:event command into its correlated engine:result event. */
export function createEngineStreamHandler(
    engine: EngineProcessor,
    publishResult: ResultPublisher = (event) => RedisPublisher.publishTradeResult(event)
) {
    return async (event: AnyMarketEvent) => {
        const resultPayload = await engine.process(event.type, event.payload);

        // Poller/WS-originated events update engine state but have no HTTP caller.
        if (event.source !== EventSource.BACKEND) {
            return;
        }

        const resultEvent = {
            requestId: event.requestId,
            backendId: event.backendId,
            sourceEventType: event.type,
            success: resultPayload.success,
            payload: resultPayload,
            updates: resultPayload.updates,
            timestamp: Date.now(),
        } as AnyTradeResultEvent;

        await publishResult(resultEvent);
    };
}
