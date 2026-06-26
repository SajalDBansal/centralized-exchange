import { randomUUID } from "node:crypto";
import { RedisPublisher } from "@workspace/redis-streams";
import {
    EVENT_TO_ENGINE_SUBJECT,
    EventSource,
    FundingSettlePayload,
    IndexPriceUpdatePayload,
    MarketEvent,
} from "@workspace/types";

const BINANCE_STREAM_URL = process.env.BINANCE_MARK_PRICE_STREAM_URL
    ?? "wss://fstream.binance.com/market/ws/!markPrice@arr@1s";
const FUNDING_INTERVAL_SECONDS = Number(process.env.FUNDING_INTERVAL_SECONDS ?? 3_600);
const MARKET_BY_BINANCE_SYMBOL: Record<string, string> = {
    BTCUSDT: "BTC_PERP",
    ETHUSDT: "ETH_PERP",
    SOLUSDT: "SOL_PERP",
};

type BinanceMarkPrice = {
    E: number;
    s: string;
    p: string;
    i: string;
};

type BinanceCombinedStreamMessage = {
    stream: string;
    data: BinanceMarkPrice | BinanceMarkPrice[];
};

type LatestPrice = {
    indexPrice: string;
    markPrice: string;
};

const latestPrices = new Map<string, LatestPrice>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isBinanceMarkPrice(value: unknown): value is BinanceMarkPrice {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.E === "number"
        && typeof value.s === "string"
        && typeof value.p === "string"
        && typeof value.i === "string";
}

function isBinanceCombinedStreamMessage(value: unknown): value is BinanceCombinedStreamMessage {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.stream === "string"
        && (isBinanceMarkPrice(value.data)
            || (Array.isArray(value.data) && value.data.every(isBinanceMarkPrice)));
}

export function parseMarkPriceMessage(rawMessage: string) {
    const message = JSON.parse(rawMessage) as unknown;

    if (Array.isArray(message)) {
        return message.filter(isBinanceMarkPrice);
    }

    if (isBinanceMarkPrice(message)) {
        return [message];
    }

    if (isBinanceCombinedStreamMessage(message)) {
        return Array.isArray(message.data) ? message.data : [message.data];
    }

    return [];
}

async function publish(type: MarketEvent["type"], payload: MarketEvent["payload"]) {
    await RedisPublisher.publishMarketEvent({
        requestId: randomUUID(),
        backendId: "ws-index-poller",
        source: EventSource.WS,
        type,
        payload,
        timestamp: Date.now(),
    });
}

export async function handlePrice(price: BinanceMarkPrice) {
    const marketId = MARKET_BY_BINANCE_SYMBOL[price.s];

    if (!marketId) {
        return;
    }

    latestPrices.set(marketId, { indexPrice: price.i, markPrice: price.p });

    const payload: IndexPriceUpdatePayload = {
        marketId,
        indexPrice: price.i,
        timestamp: price.E,
    };

    await publish(EVENT_TO_ENGINE_SUBJECT.INDEX_PRICE_UPDATE, payload);
}

export async function publishFundingSettlements() {
    for (const [marketId, price] of latestPrices) {
        const payload: FundingSettlePayload = {
            marketId,
            indexPrice: price.indexPrice,
            markPrice: price.markPrice,
            intervalSeconds: FUNDING_INTERVAL_SECONDS,
        };

        await publish(EVENT_TO_ENGINE_SUBJECT.FUNDING_SETTLE, payload);
    }
}

export function resetLatestPricesForTests() {
    latestPrices.clear();
}

function connect() {
    const socket = new WebSocket(BINANCE_STREAM_URL);

    socket.addEventListener("open", () => {
        console.log("Binance mark-price websocket connected");
    });

    socket.addEventListener("message", (event) => {
        void Promise.resolve()
            .then(() => parseMarkPriceMessage(String(event.data)))
            .then((prices) => Promise.all(prices.map(handlePrice)))
            .catch((error) => console.error("Failed to publish index update", error));
    });

    socket.addEventListener("close", () => {
        console.error("Binance mark-price websocket closed; reconnecting");
        setTimeout(connect, 1_000);
    });

    socket.addEventListener("error", (error) => {
        console.error("Binance mark-price websocket error", error);
        socket.close();
    });
}

export function startIndexPoller() {
    if (!Number.isInteger(FUNDING_INTERVAL_SECONDS) || FUNDING_INTERVAL_SECONDS <= 0) {
        throw new Error("FUNDING_INTERVAL_SECONDS must be a positive integer");
    }

    setInterval(() => {
        void publishFundingSettlements().catch((error) => console.error("Failed to publish funding settlement", error));
    }, FUNDING_INTERVAL_SECONDS * 1_000);

    connect();
}

if (process.env.NODE_ENV !== "test") {
    startIndexPoller();
}
