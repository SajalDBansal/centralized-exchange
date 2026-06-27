import type { TickerB } from "@workspace/types";

const WS_URL = process.env.NEXT_PUBLIC_BACKPACK_WS_URL ?? "wss://ws.backpack.exchange";

export type DepthWsEvent = {
    e: "depth";
    E: number;
    T: number;
    s: string;
    a: [string, string][];
    b: [string, string][];
    U: number;
    u: number;
};

export type TradeWsEvent = {
    e: "trade";
    E: number;
    T: number;
    s: string;
    p: string;
    q: string;
    b: string;
    a: string;
    t: number;
    m: boolean;
};

export type MarkPriceWsEvent = {
    e: "markPrice";
    E: number;
    T: number;
    s: string;
    p: string;
    f?: string;
    i?: string;
    n?: number;
};

export type TickerWsEvent = {
    e: "ticker";
    E: number;
    s: string;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    V: string;
    n: number;
};

export type KlineWsEvent = {
    e: "kline";
    E: number;
    s: string;
    t: string;
    T: string;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    n: number;
    X: boolean;
};

export type OpenInterestWsEvent = {
    e: "openInterest";
    E: number;
    s: string;
    o: string;
};

export type BackpackPublicEvent =
    | DepthWsEvent
    | TradeWsEvent
    | MarkPriceWsEvent
    | TickerWsEvent
    | KlineWsEvent
    | OpenInterestWsEvent;

type StreamHandler<T extends BackpackPublicEvent = BackpackPublicEvent> = (data: T, stream: string) => void;
type StreamEnvelope = { stream: string; data: BackpackPublicEvent };

const isStreamEnvelope = (value: unknown): value is StreamEnvelope => {
    if (!value || typeof value !== "object") return false;
    const envelope = value as Partial<StreamEnvelope>;
    return typeof envelope.stream === "string" && !!envelope.data && typeof envelope.data === "object";
};

class BackpackWsClient {
    private socket: WebSocket | null = null;
    private listeners = new Map<string, Set<StreamHandler>>();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempt = 0;
    private closingBecauseIdle = false;

    subscribe<T extends BackpackPublicEvent>(streams: string | string[], handler: StreamHandler<T>): () => void {
        const uniqueStreams = [...new Set(Array.isArray(streams) ? streams : [streams])];
        const newlyActive: string[] = [];

        for (const stream of uniqueStreams) {
            const handlers = this.listeners.get(stream) ?? new Set<StreamHandler>();
            if (handlers.size === 0) newlyActive.push(stream);
            handlers.add(handler as StreamHandler);
            this.listeners.set(stream, handlers);
        }

        this.ensureConnection();
        this.send("SUBSCRIBE", newlyActive);

        let active = true;
        return () => {
            if (!active) return;
            active = false;
            const newlyInactive: string[] = [];

            for (const stream of uniqueStreams) {
                const handlers = this.listeners.get(stream);
                if (!handlers) continue;
                handlers.delete(handler as StreamHandler);
                if (handlers.size === 0) {
                    this.listeners.delete(stream);
                    newlyInactive.push(stream);
                }
            }

            this.send("UNSUBSCRIBE", newlyInactive);
            if (this.listeners.size === 0) this.closeIdleConnection();
        };
    }

    private ensureConnection() {
        if (typeof window === "undefined") return;
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

        this.closingBecauseIdle = false;
        const socket = new WebSocket(WS_URL);
        this.socket = socket;

        socket.addEventListener("open", () => {
            if (this.socket !== socket) return;
            this.reconnectAttempt = 0;
            this.send("SUBSCRIBE", [...this.listeners.keys()]);
        });

        socket.addEventListener("message", (event) => {
            try {
                const parsed: unknown = JSON.parse(String(event.data));
                if (!isStreamEnvelope(parsed)) return;
                const handlers = this.listeners.get(parsed.stream);
                handlers?.forEach((listener) => listener(parsed.data, parsed.stream));
            } catch (error) {
                console.warn("Ignored malformed Backpack WebSocket message", error);
            }
        });

        socket.addEventListener("close", () => {
            if (this.socket !== socket) return;
            this.socket = null;
            if (!this.closingBecauseIdle && this.listeners.size > 0) this.scheduleReconnect();
        });

        socket.addEventListener("error", () => {
            socket.close();
        });
    }

    private send(method: "SUBSCRIBE" | "UNSUBSCRIBE", streams: string[]) {
        if (streams.length === 0 || this.socket?.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify({ method, params: streams }));
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        const delay = Math.min(1_000 * 2 ** this.reconnectAttempt, 30_000);
        this.reconnectAttempt += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.ensureConnection();
        }, delay);
    }

    private closeIdleConnection() {
        this.closingBecauseIdle = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.reconnectAttempt = 0;
        this.socket?.close(1000, "No active subscriptions");
        this.socket = null;
    }
}

export const backpackWs = new BackpackWsClient();

export function tickerFromWs(event: TickerWsEvent): TickerB {
    const firstPrice = Number(event.o);
    const lastPrice = Number(event.c);
    const priceChange = lastPrice - firstPrice;
    return {
        symbol: event.s,
        firstPrice: event.o,
        lastPrice: event.c,
        priceChange: String(priceChange),
        priceChangePercent: String(firstPrice === 0 ? 0 : priceChange / firstPrice),
        high: event.h,
        low: event.l,
        volume: event.v,
        quoteVolume: event.V,
        trades: String(event.n),
    };
}

export function subscribeBatched<T extends BackpackPublicEvent>(
    streams: string[],
    onBatch: (events: T[]) => void,
    intervalMs = 250,
) {
    const pending = new Map<string, T>();
    const unsubscribe = backpackWs.subscribe<T>(streams, (event, stream) => pending.set(stream, event));
    const timer = window.setInterval(() => {
        if (pending.size === 0) return;
        const events = [...pending.values()];
        pending.clear();
        onBatch(events);
    }, intervalMs);

    return () => {
        window.clearInterval(timer);
        pending.clear();
        unsubscribe();
    };
}

export const wsStreams = {
    depth: (symbol: string) => `depth.200ms.${symbol}`,
    trade: (symbol: string) => `trade.${symbol}`,
    markPrice: (symbol: string) => `markPrice.${symbol}`,
    ticker: (symbol: string) => `ticker.${symbol}`,
    kline: (symbol: string, interval: string) => `kline.${interval}.${symbol}`,
    openInterest: (symbol: string) => `openInterest.${symbol}`,
};
