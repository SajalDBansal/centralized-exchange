import RedisManager from "./client";
import { REDIS_STREAMS } from "@workspace/types";
import {
    IncomingEventTypes,
    MarketEvent,
    TradeResultEvent,
} from "@workspace/types";

export class RedisPublisher {

    static async publishMarketEvent<TSubject extends IncomingEventTypes>(event: MarketEvent<TSubject>) {

        const redis = await RedisManager.getInstance();

        return redis.xAdd(REDIS_STREAMS.MARKET_EVENT, "*", { data: JSON.stringify(event) });
    }

    static async publishTradeResult<TSubject extends IncomingEventTypes>(event: TradeResultEvent<TSubject>) {

        const redis = await RedisManager.getInstance();

        return redis.xAdd(REDIS_STREAMS.ENGINE_RESULT, "*", { data: JSON.stringify(event) });
    }

}
