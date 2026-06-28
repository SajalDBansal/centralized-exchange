import type {
    EngineRequestPayloadBySubject,
    EngineResponsePayloadBySubject,
    EngineReturnUpdates,
    IncomingEventTypes,
} from "./nats-types";

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

export type EngineStreamRequest<TSubject extends IncomingEventTypes = IncomingEventTypes> = {
    source: EventSource;
    type: TSubject;
} & (EngineRequestPayloadBySubject[TSubject] extends undefined
    ? { payload?: undefined }
    : { payload: EngineRequestPayloadBySubject[TSubject] });

export type MarketEvent<TSubject extends IncomingEventTypes = IncomingEventTypes> = EngineStreamRequest<TSubject> & {
    requestId: string;
    backendId: string;
    timestamp: number;
};

export type AnyMarketEvent = {
    [TSubject in IncomingEventTypes]: MarketEvent<TSubject>;
}[IncomingEventTypes];

export interface TradeResultEvent<TSubject extends IncomingEventTypes = IncomingEventTypes> {
    requestId: string;
    backendId: string;
    sourceEventType: TSubject;
    success: boolean;
    payload: EngineResponsePayloadBySubject[TSubject];
    updates?: EngineReturnUpdates;
    timestamp: number;
}

export type AnyTradeResultEvent = {
    [TSubject in IncomingEventTypes]: TradeResultEvent<TSubject>;
}[IncomingEventTypes];

export interface ConsumeOptions<T> {
    stream: string;
    group: string;
    consumer: string;
    blockTime?: number;
    batchSize?: number;
    handler: (data: T) => Promise<void>;
}
