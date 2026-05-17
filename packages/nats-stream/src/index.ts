import cuid from "cuid";
import { connect, Empty } from "nats";
import type { NatsConnection, Subscription, Msg } from "nats";
import type { NatsIncomingSubjectTypes } from "@workspace/types";
import "dotenv/config";

const NATS_URL = process.env.NATS_URL;

if (!NATS_URL) {
    throw new Error("NATS_URL is missing");
}

const BIGINT_TAG = "__bigint";

function encodePayload<T>(data: T): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(data, (_key, value) =>
        typeof value === "bigint" ? { [BIGINT_TAG]: value.toString() } : value
    ));
}

function decodePayload<T>(data: Uint8Array): T {
    return JSON.parse(new TextDecoder().decode(data), (_key, value) => {
        const bigintRaw =
            value !== null &&
                typeof value === "object" &&
                BIGINT_TAG in value
                ? (value as Record<string, string>)[BIGINT_TAG]
                : undefined;
        if (typeof bigintRaw === "string") {
            return BigInt(bigintRaw);
        }
        return value;
    }) as T;
}

type Handler<TReq, TRes> = (
    subject: NatsIncomingSubjectTypes,
    data: TReq
) => Promise<TRes>;

export class NatsManager {

    private static instance: NatsManager;
    private static instancePromise: Promise<NatsManager>;
    private nc!: NatsConnection;
    private constructor() { }

    public static async getInstance(): Promise<NatsManager> {

        if (this.instance) return this.instance;

        if (!this.instancePromise) {
            this.instancePromise = (async () => {
                const manager = new NatsManager();
                await manager.connect();
                this.instance = manager;
                return manager;

            })();
        }

        return this.instancePromise;
    }

    private async connect() {

        // TODO: read about this
        this.nc = await connect({
            servers: NATS_URL,
            name: `engine-${cuid()}`,
            reconnect: true,
            maxReconnectAttempts: -1,
            reconnectTimeWait: 2000,
            pingInterval: 10000
        });

        // console.log("Connected to NATS");

        this.nc.closed().then((err) => {
            if (err) {
                console.error("NATS closed with error", err);
            }
        });
    }

    public async request<TRes, TReq = void>(
        subject: NatsIncomingSubjectTypes,
        payload?: TReq,
        timeout = 5000
    ): Promise<TRes> {

        const response = await this.nc.request(
            subject,
            payload !== undefined ? encodePayload(payload) : Empty,
            { timeout });

        return decodePayload<TRes>(response.data);
    }

    public async subscribe<TReq, TRes>(pattern: string, handler: Handler<TReq, TRes>, queueGroup = "engine-workers") {
        const sub: Subscription = this.nc.subscribe(pattern, { queue: queueGroup });

        console.log(`Subscribed to ${pattern}`);
        (async () => {
            for await (const msg of sub) {
                await this.handleMessage<TReq, TRes>(msg, handler);
            }
        })();
    }

    private async handleMessage<TReq, TRes>(msg: Msg, handler: Handler<TReq, TRes>) {
        try {
            const data = (msg.data.length === 0 ? undefined : decodePayload<TReq>(msg.data)) as TReq;
            const subject = msg.subject as NatsIncomingSubjectTypes;
            const result = await handler(subject, data);

            if (msg.reply) {
                msg.respond(encodePayload(result));
            }

        } catch (error: any) {
            console.error("NATS handler error", error);
            if (msg.reply) {
                msg.respond(encodePayload({
                    success: false,
                    error: error.message
                }));
            }
        }
    }

    public publish<T>(subject: NatsIncomingSubjectTypes, payload: T) {
        this.nc.publish(subject, encodePayload(payload));
    }

    public async disconnect() {
        console.log("Draining NATS connection");
        await this.nc.drain();
    }
}