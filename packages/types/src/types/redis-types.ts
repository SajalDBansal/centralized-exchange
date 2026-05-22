import { IncomingEventTypes, PayloadToEngineType } from "./nats-types";

export const REDIS_STREAMS = {
    MARKET_EVENT: "market:event",

    backendResponse: (backendId: string) => `backend:response:${backendId}`,
}

export const CONSUMER_GROUPS = {
    TRADE_ENGINE: "trade-engine-group",
    SNAPSHOT_ENGINE: "snapshot-engine-group",
}

export const CONSUMERS = {
    TRADE_ENGINE: "trade-engine",
    SNAPSHOT_ENGINE: "snapshot-engine",
}

export enum EventSource {
    WS = "WS",
    BACKEND = "BACKEND"
}

export interface MarketEvent {
    requestId: string;
    backendId: string;
    source: EventSource;
    type: IncomingEventTypes;
    payload: PayloadToEngineType;
    timestamp: number;
}

export interface TradeResultEvent {
    requestId: string;
    backendId: string;
    success: boolean;
    payload: Record<string, any>;
    timestamp: number;
}

export interface ConsumeOptions<T> {
    stream: string;
    group: string;
    consumer: string;
    blockTime?: number;
    batchSize?: number;
    handler: (data: T) => Promise<void>;
}
