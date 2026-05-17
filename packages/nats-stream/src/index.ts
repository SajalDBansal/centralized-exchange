import cuid from "cuid";
import { connect, Empty, JSONCodec } from "nats";
import type { NatsConnection, Subscription, Msg } from "nats";
import type { Handler, NatsIncomingSubjectTypes } from "@workspace/types";
import "dotenv/config";

const NATS_URL = process.env.NATS_URL;

if (!NATS_URL) {
    throw new Error("NATS_URL is missing");
}

const jc = JSONCodec();


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
            payload !== undefined ? jc.encode(payload) : Empty,
            { timeout });

        return jc.decode(response.data) as TRes;
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
            const data = jc.decode(msg.data) as TReq;
            const subject = msg.subject as NatsIncomingSubjectTypes;
            const result = await handler(subject, data);

            if (msg.reply) {
                msg.respond(
                    jc.encode(result)
                );
            }

        } catch (error: any) {
            console.error("NATS handler error", error);
            if (msg.reply) {
                msg.respond(jc.encode({
                    success: false,
                    error: error.message
                }));
            }
        }
    }

    public publish<T>(subject: NatsIncomingSubjectTypes, payload: T) {
        this.nc.publish(subject, jc.encode(payload));
    }

    public async disconnect() {
        console.log("Draining NATS connection");
        await this.nc.drain();
    }
}