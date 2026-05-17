import type { RequestHandler, Request, Response } from "express";
import { ApiError, ValidationError } from "../errors/error";
import { NatsManager } from "@workspace/nats-streams";
import { GetDepthPayload, GetDepthReturnPayload, MarketSymbolType, NATS_INCOMING_SUBJECT } from "@workspace/types";

const natsPromise = NatsManager.getInstance();

export const getDepthByMarket: RequestHandler = async (request: Request, response: Response) => {
    const { market } = request.params as { market: MarketSymbolType };

    if (!market) throw new ValidationError("MarketId is required");

    const nats = await natsPromise;

    const res = await nats.request<GetDepthReturnPayload, GetDepthPayload>(
        NATS_INCOMING_SUBJECT.DEPTH_GET,
        { market }
    );

    if (!res.success) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        market: res.market,
        depths: res.depths
    });
}