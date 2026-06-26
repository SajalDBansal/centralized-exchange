import RedisManager from "./client";
import { REDIS_STREAMS } from "@workspace/types";
import {
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

        return redis.xAdd(REDIS_STREAMS.ENGINE_RESULT, "*", { data: JSON.stringify(event) });
    }

}
