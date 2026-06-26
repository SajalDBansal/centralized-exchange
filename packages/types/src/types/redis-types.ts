import type { EngineReturnUpdates, IncomingEventTypes, PayloadToBackendType, PayloadToEngineType } from "./nats-types";

export const REDIS_STREAMS = {
    MARKET_EVENT: "market:event",
    ENGINE_RESULT: "engine:result",
}

export const CONSUMER_GROUPS = {
    TRADE_ENGINE: "trade-engine-group",
    SNAPSHOT_ENGINE: "snapshot-engine-group",
    DATABASE_ENGINE: "database-engine-group",
    WS_SERVER: "ws-server-group",
}

export const CONSUMERS = {
    TRADE_ENGINE: "trade-engine",
    SNAPSHOT_ENGINE: "snapshot-engine",
    DATABASE_ENGINE: "database-engine",
    WS_SERVER: "ws-server",
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
    sourceEventType: IncomingEventTypes;
    success: boolean;
    payload: PayloadToBackendType;
    updates?: EngineReturnUpdates;
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
