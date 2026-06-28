import cuid from "cuid";
import {
    EngineStreamRequest,
    IncomingEventTypes,
    MarketEvent,
    REDIS_STREAMS,
    TradeResultEvent,
} from "@workspace/types";
import { RedisManager, RedisPublisher } from "@workspace/redis-streams";

export class BackendResponseRouter {
    public readonly backendId: string;

    private responseMap = new Map<string, {
        resolve: (val: any) => void;
        reject: (err: any) => void;
        timeoutId: NodeJS.Timeout;
    }>();

    private isRunning = false;

    constructor() {
        this.backendId = `backend-${cuid()}`;
    }

    async startListener() {
        if (this.isRunning) return;
        this.isRunning = true;

        const redis = await RedisManager.createBlockingConnection(`response:${this.backendId}`);
        const streamKey = REDIS_STREAMS.ENGINE_RESULT;

        console.log(`[ResponseRouter] Starting listener on stream: ${streamKey}`);

        // Run background consumer
        (async () => {
            let lastId = "0"; // or "$" to read only new messages

            // To be safe, we can pre-read or read from $
            lastId = "$";

            while (this.isRunning) {
                try {
                    const response = await redis.xRead(
                        { key: streamKey, id: lastId },
                        { BLOCK: 100, COUNT: 1 }
                    );

                    if (!response) continue;

                    for (const streamData of response) {
                        for (const message of streamData.messages) {
                            try {
                                const raw = message.message.data;
                                if (typeof raw === "string") {
                                    const event: TradeResultEvent = JSON.parse(raw);

                                    // Match only responses intended for this backend process.
                                    if (event.backendId !== this.backendId) {
                                        lastId = message.id;
                                        continue;
                                    }

                                    const pending = this.responseMap.get(event.requestId);
                                    if (pending) {
                                        clearTimeout(pending.timeoutId);
                                        this.responseMap.delete(event.requestId);
                                        pending.resolve(event);
                                    }
                                }
                            } catch (err) {
                                console.error("[ResponseRouter] Error processing response message", err);
                            }

                            // Update lastId to avoid reprocessing
                            lastId = message.id;
                        }
                    }
                } catch (error) {
                    console.error("[ResponseRouter] Error in response reading loop", error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        })();
    }

    /**
     * Publishes a request event and returns a promise that resolves
     * when the matching trade result event returns on our stream.
     */
    async request<TSubject extends IncomingEventTypes>(
        marketEvent: EngineStreamRequest<TSubject>,
        timeoutMs = 5000
    ): Promise<TradeResultEvent<TSubject>> {
        const requestId = cuid();
        const enrichedEvent = {
            ...marketEvent,
            requestId,
            backendId: this.backendId,
            timestamp: Date.now()
        } as MarketEvent<TSubject>;

        return new Promise<TradeResultEvent<TSubject>>((resolve, reject) => {
            // Set up timeout to prevent memory leak / hanging connections
            const timeoutId = setTimeout(() => {
                this.responseMap.delete(requestId);
                reject(new Error(`Request timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            // Register promise callbacks
            this.responseMap.set(requestId, {
                resolve: (value) => resolve(value as TradeResultEvent<TSubject>),
                reject,
                timeoutId,
            });

            // Publish to engine stream after the response callback is registered.
            void RedisPublisher.publishMarketEvent(enrichedEvent).catch((error) => {
                clearTimeout(timeoutId);
                this.responseMap.delete(requestId);
                reject(error);
            });
        });
    }

    stop() {
        this.isRunning = false;
    }
}

// Export single instance for core-backend
export const backendRouter = new BackendResponseRouter();
