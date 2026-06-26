import { initializeStreams, RedisManager } from "@workspace/redis-streams";
import {
    CONSUMER_GROUPS,
    CONSUMERS,
    MarketDataEvent,
    REDIS_STREAMS,
    TradeResultEvent,
} from "@workspace/types";
import type { MarketDataGateway } from "./gateway";

type RedisStreamMessage = {
    id: string;
    message: {
        data?: unknown;
    };
};

export type RedisMarketDataSubscription = {
    close: () => Promise<void>;
};

export const connectRedisMarketDataSubscriber = async (
    gateway: Pick<MarketDataGateway, "publishToLocalClients">
): Promise<RedisMarketDataSubscription> => {
    await initializeStreams();

    let running = true;
    const consumer = `${CONSUMERS.WS_SERVER}-${process.pid}`;
    const blockingRedis = await RedisManager.createBlockingConnection(
        `${REDIS_STREAMS.ENGINE_RESULT}:${CONSUMER_GROUPS.WS_SERVER}:${consumer}`
    );
    const redis = await RedisManager.getInstance();

    void (async () => {
        while (running) {
            const response = await blockingRedis.xReadGroup(
                CONSUMER_GROUPS.WS_SERVER,
                consumer,
                [{ key: REDIS_STREAMS.ENGINE_RESULT, id: ">" }],
                { BLOCK: 1_000, COUNT: 100 }
            );

            if (!response) {
                continue;
            }

            for (const streamData of response) {
                const messages = streamData.messages as RedisStreamMessage[];

                for (const message of messages) {
                    try {
                        for (const event of marketDataEventsFromMessage(message)) {
                            gateway.publishToLocalClients(event);
                        }
                    } catch (error) {
                        console.error("Invalid engine result stream event", error);
                    } finally {
                        await redis.xAck(REDIS_STREAMS.ENGINE_RESULT, CONSUMER_GROUPS.WS_SERVER, message.id);
                    }
                }
            }
        }
    })().catch((error) => {
        console.error("WebSocket market data stream consumer crashed", error);
    });

    return {
        close: async () => {
            running = false;
            await blockingRedis.quit();
        },
    };
};

function marketDataEventsFromMessage(message: RedisStreamMessage): MarketDataEvent[] {
    const raw = message.message.data;

    if (typeof raw !== "string") {
        return [];
    }

    const result = JSON.parse(raw) as TradeResultEvent;

    return result.updates?.marketData ?? result.payload?.updates?.marketData ?? [];
}
