import RedisManager from "./client";
import { REDIS_STREAMS } from "@workspace/types";
import {
    DatabaseStreamEvent,
    MarketEvent,
    TradeResultEvent,
} from "@workspace/types";

export class RedisPublisher {

    static async publishMarketEvent(event: MarketEvent) {

        const redis = await RedisManager.getInstance();

        return redis.xAdd(REDIS_STREAMS.MARKET_EVENT, "*", { data: JSON.stringify(event) });
    }

    static async publishTradeResult(event: TradeResultEvent) {

        const redis = await RedisManager.getInstance();

        return redis.xAdd(REDIS_STREAMS.backendResponse(event.backendId), "*", { data: JSON.stringify(event) });
    }

    static async publishDatabaseEvent(event: DatabaseStreamEvent) {

        const redis = await RedisManager.getInstance();

        return redis.xAdd(REDIS_STREAMS.DATABASE_EVENT, "*", { data: JSON.stringify(event) });
    }

    static async publishPubSub(channel: string, message: string) {

        const redis = await RedisManager.getInstance();

        return redis.publish(channel, message);
    }
}
