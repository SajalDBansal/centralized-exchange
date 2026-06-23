import RedisManager from "./client";
import { ConsumeOptions } from "@workspace/types";

export class RedisConsumer<T> {

    constructor(private options: ConsumeOptions<T>) { }

    async start() {
        const blockingRedis = await RedisManager.createBlockingConnection(
            `${this.options.stream}:${this.options.group}:${this.options.consumer}`
        );
        const redis = await RedisManager.getInstance();

        while (true) {
            try {
                const response = await blockingRedis.xReadGroup(
                    this.options.group,
                    this.options.consumer,
                    [
                        {
                            key: this.options.stream,
                            id: ">",
                        },
                    ],
                    {
                        BLOCK: this.options.blockTime || 100,
                        COUNT: this.options.batchSize || 1,
                    }
                );

                if (!response) continue;

                for (const streamData of response) {
                    for (const message of streamData.messages) {
                        try {
                            const raw = message.message.data;

                            if (typeof raw !== "string") {
                                console.error("Invalid message data", raw);
                                continue;
                            }

                            const parsed: T = JSON.parse(raw);
                            await this.options.handler(parsed);
                            await redis.xAck(this.options.stream, this.options.group, message.id);

                        } catch (err) {
                            console.error("Consumer processing failed", err);
                        }
                    }
                }
            } catch (err) {
                console.error("Consumer crashed", err);
            }
        }
    }
}
