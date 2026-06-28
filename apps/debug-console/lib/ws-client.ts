export const MARKET_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8081/ws";

export type MarketStream = "ticker" | "price" | "depth";
export type WsStatus = "connecting" | "open" | "closed" | "error";

export type DepthLevel = { price: string; quantity: string };

export type MarketDataEvent = {
    type: "ticker.update" | "price.update" | "depth.update";
    stream: MarketStream;
    marketId: string;
    eventTs: number;
    seq?: number;
    data: Record<string, unknown> & {
        lastPrice?: string;
        bids?: DepthLevel[];
        asks?: DepthLevel[];
    };
};

export function subscribeMarketData({
    marketIds,
    streams = ["ticker", "price", "depth"],
    onEvent,
    onStatus,
    onControl,
}: {
    marketIds: string[];
    streams?: MarketStream[];
    onEvent: (event: MarketDataEvent) => void;
    onStatus?: (status: WsStatus, detail?: string) => void;
    onControl?: (message: unknown) => void;
}) {
    let socket: WebSocket | null = null;
    let stopped = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const keys = marketIds.flatMap((marketId) =>
        streams.map((stream) => `${stream}:${marketId.trim().toUpperCase()}`),
    );

    const connect = () => {
        if (stopped || typeof window === "undefined") return;
        onStatus?.("connecting", MARKET_WS_URL);
        socket = new WebSocket(MARKET_WS_URL);

        socket.addEventListener("open", () => {
            reconnectAttempt = 0;
            onStatus?.("open", `${keys.length} streams`);
            socket?.send(JSON.stringify({ type: "subscribe", streams: keys }));
        });

        socket.addEventListener("message", (message) => {
            try {
                const parsed = JSON.parse(String(message.data)) as unknown;
                if (isMarketDataEvent(parsed)) onEvent(parsed);
                else onControl?.(parsed);
            } catch {
                onControl?.({ type: "error", message: "Malformed websocket frame" });
            }
        });

        socket.addEventListener("error", () => onStatus?.("error", MARKET_WS_URL));
        socket.addEventListener("close", (event) => {
            socket = null;
            if (stopped) {
                onStatus?.("closed", "client cleanup");
                return;
            }

            onStatus?.("closed", `code=${event.code}; reconnecting`);
            const delay = Math.min(1_000 * 2 ** reconnectAttempt, 15_000);
            reconnectAttempt += 1;
            reconnectTimer = setTimeout(connect, delay);
        });
    };

    connect();

    return () => {
        stopped = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "unsubscribe", streams: keys }));
        }
        socket?.close(1000, "component unmounted");
        socket = null;
    };
}

function isMarketDataEvent(value: unknown): value is MarketDataEvent {
    if (!value || typeof value !== "object") return false;
    const event = value as Partial<MarketDataEvent>;
    return (
        typeof event.marketId === "string" &&
        typeof event.eventTs === "number" &&
        (event.stream === "ticker" || event.stream === "price" || event.stream === "depth") &&
        !!event.data &&
        typeof event.data === "object"
    );
}
