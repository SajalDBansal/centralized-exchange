import RedisManager from "./client";
import { CONSUMER_GROUPS, REDIS_STREAMS } from "@workspace/types";

export async function initializeStreams() {
    const redis = await RedisManager.getInstance();

    await createGroup(
        REDIS_STREAMS.MARKET_EVENT,
        CONSUMER_GROUPS.TRADE_ENGINE
    );

    await createGroup(
        REDIS_STREAMS.MARKET_EVENT,
        CONSUMER_GROUPS.SNAPSHOT_ENGINE
    );

    await createGroup(
        REDIS_STREAMS.ENGINE_RESULT,
        CONSUMER_GROUPS.DATABASE_ENGINE
    );

    await createGroup(
        REDIS_STREAMS.ENGINE_RESULT,
        CONSUMER_GROUPS.WS_SERVER
    );
}

async function createGroup(stream: string, group: string) {
    const redis = await RedisManager.getInstance();

    try {
        await redis.xGroupCreate(stream, group, "0", { MKSTREAM: true, });

        console.log(`Created group ${group}`);

    } catch (err: any) {

        if (err.message.includes("BUSYGROUP")) {
            console.log(`Group ${group} already exists`);
            return;
        }

        throw err;
    }
}
