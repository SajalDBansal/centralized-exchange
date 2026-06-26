import { NatsManager } from "@workspace/nats-streams";
import {
    createEmptyTicker,
    EVENT_TO_ENGINE_SUBJECT,
    GetDepthPayload,
    GetDepthReturnPayload,
    GetMarketByIdPayload,
    GetMarketByIdReturnPayload,
    GetMarketsReturnPayload,
    MarketId,
    MarketSnapshot,
    normalizeMarketId,
    OrderbookData,
    TickersSnapshot,
} from "@workspace/types";
import { Request, RequestHandler, Response } from "express";
import { ApiError, ValidationError } from "../errors/error";

const natsPromise = NatsManager.getInstance();

export const getMarketSnapshot: RequestHandler = async (request: Request, response: Response) => {
    const marketId = resolveMarketId(request.params.marketId);
    const nats = await natsPromise;

    const [marketRes, depthRes] = await Promise.all([
        nats.request<GetMarketByIdReturnPayload, GetMarketByIdPayload>(
            EVENT_TO_ENGINE_SUBJECT.MARKET_GET,
            { marketId }
        ),
        nats.request<GetDepthReturnPayload, GetDepthPayload>(
            EVENT_TO_ENGINE_SUBJECT.DEPTH_GET,
            { marketId }
        ),
    ]);

    if (!marketRes.success || !marketRes.data) {
        throw new ApiError(400, marketRes.message);
    }

    if (!depthRes.success || !depthRes.data) {
        throw new ApiError(400, depthRes.message);
    }

    const orderbook = depthRes.data.depths;
    const lastPrice = deriveLastPrice(orderbook);
    const snapshot: MarketSnapshot = {
        marketId,
        snapshotAt: Date.now(),
        orderbookSeq: depthRes.eventId,
        price: { lastPrice },
        ticker: createEmptyTicker(lastPrice),
        orderbook,
    };

    return response.status(200).json({
        success: true,
        message: "Market snapshot fetched",
        data: {
            market: marketRes.data.market,
            snapshot,
        },
    });
};

export const getMarketTickers: RequestHandler = async (_request: Request, response: Response) => {
    const nats = await natsPromise;

    const marketsRes = await nats.request<GetMarketsReturnPayload>(
        EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL
    );

    if (!marketsRes.success || !marketsRes.data) {
        throw new ApiError(400, marketsRes.message);
    }

    const snapshotAt = Date.now();
    const tickers: TickersSnapshot = {
        snapshotAt,
        tickers: Object.values(marketsRes.data.markets).map((market) => ({
            type: "ticker.update",
            stream: "ticker",
            marketId: normalizeMarketId(market.id),
            eventTs: snapshotAt,
            data: createEmptyTicker(),
        })),
    };

    return response.status(200).json({
        success: true,
        message: "Market tickers fetched",
        data: tickers,
    });
};

function resolveMarketId(value: unknown): MarketId {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ValidationError("MarketId is required");
    }

    return normalizeMarketId(value);
}

function deriveLastPrice(orderbook: OrderbookData) {
    const bestBid = orderbook.bids[0]?.price;
    const bestAsk = orderbook.asks[0]?.price;

    if (bestBid && bestAsk) {
        const bid = Number(bestBid);
        const ask = Number(bestAsk);

        if (Number.isFinite(bid) && Number.isFinite(ask)) {
            return ((bid + ask) / 2).toString();
        }
    }

    return bestBid ?? bestAsk ?? "0";
}
