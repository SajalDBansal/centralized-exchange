import { NatsManager } from "@workspace/nats-streams";
import { Request, RequestHandler, Response } from "express";
import { ApiError, AuthenticationError, ValidationError } from "../errors/error";
import { AddMarketPayload, AddMarketReturnPayload, DeleteMarketPayload, DeleteMarketReturnPayload, GetMarketByIdPayload, GetMarketByIdReturnPayload, GetMarketsPayload, GetMarketsReturnPayload, NATS_INCOMING_SUBJECT, UpdateMarketPayload, UpdateMarketReturnPayload } from "@workspace/types";
import { AddMarketClientSchema, GetMarketByIdClientSchema, UpdateMarketClientSchema } from "@workspace/validations";

const natsPromise = NatsManager.getInstance();

export const getMarkets: RequestHandler = async (request: Request, response: Response) => {

    // const userId = request.userId;
    const userId = "1243";

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const nats = await natsPromise;

    const res = await nats.request<GetMarketsReturnPayload, GetMarketsPayload>(
        NATS_INCOMING_SUBJECT.MARKET_GET_ALL,
        { userId }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });

}

export const getMarketById: RequestHandler = async (request: Request, response: Response) => {
    const params = request.params;

    // const userId = request.userId;
    const userId = "1243";

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = GetMarketByIdClientSchema.safeParse({ userId, ...params });

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { marketId } = validateData.data;

    const nats = await natsPromise;

    const res = await nats.request<GetMarketByIdReturnPayload, GetMarketByIdPayload>(
        NATS_INCOMING_SUBJECT.MARKET_GET,
        { userId, marketId }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });
}

export const addMarket: RequestHandler = async (request: Request, response: Response) => {
    const body = request.body;

    // const userId = request.userId;
    const userId = "1243";

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = AddMarketClientSchema.safeParse({ userId, market: body });

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { market } = validateData.data;

    const nats = await natsPromise;

    const res = await nats.request<AddMarketReturnPayload, AddMarketPayload>(
        NATS_INCOMING_SUBJECT.MARKET_ADD,
        { userId, market }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });

}

export const updateMarket: RequestHandler = async (request: Request, response: Response) => {
    const body = request.body;
    const params = request.params;

    // const userId = request.userId;
    const userId = "1243";

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = UpdateMarketClientSchema.safeParse({ userId, marketId: params.marketId, market: body });

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { marketId, market } = validateData.data;

    const nats = await natsPromise;

    const res = await nats.request<UpdateMarketReturnPayload, UpdateMarketPayload>(
        NATS_INCOMING_SUBJECT.MARKET_UPDATE,
        { userId, marketId, market }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });
}

export const deleteMarket: RequestHandler = async (request: Request, response: Response) => {
    const params = request.params;

    // const userId = request.userId;
    const userId = "1243";

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = GetMarketByIdClientSchema.safeParse({ userId, marketId: params.marketId });

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { marketId } = validateData.data;

    const nats = await natsPromise;

    const res = await nats.request<DeleteMarketReturnPayload, DeleteMarketPayload>(
        NATS_INCOMING_SUBJECT.MARKET_DELETE,
        { userId, marketId }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });
}
