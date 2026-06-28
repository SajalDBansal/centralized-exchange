import { Engine } from "./engines/core-engine";
// import { NatsManager } from "@workspace/nats-streams";
import { RedisConsumer, initializeStreams } from "@workspace/redis-streams";
import { AnyMarketEvent, CONSUMER_GROUPS, CONSUMERS, REDIS_STREAMS } from "@workspace/types";
import { createEngineStreamHandler } from "./stream-handler";

async function main() {
    const engine = new Engine();
    console.log("Engine Started");

    // NATS implementation retained for an easy transport rollback:
    // const nats = (await NatsManager.getInstance());
    // await nats.subscribe("engine.>", engine.process);

    // Redis streams are now the only active engine command transport.
    await initializeStreams();

    const consumer = new RedisConsumer<AnyMarketEvent>({
        stream: REDIS_STREAMS.MARKET_EVENT,
        group: CONSUMER_GROUPS.TRADE_ENGINE,
        consumer: `${CONSUMERS.TRADE_ENGINE}-${process.pid}`,
        handler: createEngineStreamHandler(engine),
    })

    await consumer.start();
}

main().catch(console.error);
