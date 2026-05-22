import { createClient, type RedisClientType, } from "redis";

type RedisClient = RedisClientType;

class RedisManager {
    private static instance: RedisClient;

    static async getInstance(): Promise<RedisClient> {
        if (!RedisManager.instance) {
            const client: RedisClient = createClient({
                socket: {
                    host: process.env.REDIS_HOST,
                    port: Number(process.env.REDIS_PORT),
                },
            });

            client.on("connect", () => { console.log("Redis connected"); });

            client.on("error", (err) => { console.error("Redis error", err); });

            await client.connect();

            RedisManager.instance = client;
        }

        return RedisManager.instance;
    }
}

export default RedisManager;