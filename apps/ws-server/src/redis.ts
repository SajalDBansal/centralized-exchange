import { RedisManager } from "@workspace/redis-streams";
import {
    MARKET_DATA_REDIS_CHANNEL,
    parseMarketDataEvent,
} from "@workspace/types";
import type { MarketDataGateway } from "./gateway";

export type RedisMarketDataSubscription = {
    close: () => Promise<void>;
};

export const connectRedisMarketDataSubscriber = async (
    gateway: Pick<MarketDataGateway, "publishToLocalClients">,
    channel = MARKET_DATA_REDIS_CHANNEL
): Promise<RedisMarketDataSubscription> => {
    const redis = await RedisManager.createBlockingConnection("market-data-pubsub");

    await redis.subscribe(channel, (message) => {
        const event = parseMarketDataEvent(message);

        if (!event) {
            return;
        }

        gateway.publishToLocalClients(event);
    });

    return {
        close: async () => {
            await redis.unsubscribe(channel);
            await redis.quit();
        },
    };
};
