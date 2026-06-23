import { Engine } from "./engines/core-engine";
import { NatsManager } from "@workspace/nats-streams";
import { RedisConsumer, RedisPublisher, initializeStreams } from "@workspace/redis-streams";
import { CONSUMER_GROUPS, CONSUMERS, EventSource, MarketEvent, EVENT_TO_ENGINE_SUBJECT, REDIS_STREAMS } from "@workspace/types";

async function main() {
    const engine = new Engine();
    const nats = (await NatsManager.getInstance());
    console.log("Engine Started");

    await nats.subscribe("engine.>", engine.process);

    // Initialize the streams and consumer groups
    await initializeStreams();

    const consumer = new RedisConsumer<MarketEvent>({
        stream: REDIS_STREAMS.MARKET_EVENT,
        group: CONSUMER_GROUPS.TRADE_ENGINE,
        consumer: `${CONSUMERS.TRADE_ENGINE}-${process.pid}`,
        handler: async (event: MarketEvent) => {
            // 1. Process via existing core trading logic
            // Adapt the event type to fit the previous Nats incoming subject format if needed
            const resultPayload = await engine.process(event.type, event.payload);

            if (event.source !== EventSource.BACKEND) {
                return;
            }

            // 2. Format result
            const resultEvent = {
                requestId: event.requestId,
                backendId: event.backendId,
                success: resultPayload.success,
                payload: resultPayload,
                timestamp: Date.now(),
            };

            // 3. Publish back to backend specific stream
            await RedisPublisher.publishTradeResult(resultEvent);
        }
    })

    await consumer.start();
}

main().catch(console.error);
