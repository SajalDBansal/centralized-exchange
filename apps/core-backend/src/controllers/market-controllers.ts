// import { NatsManager } from "@workspace/nats-streams";
import { Request, RequestHandler, Response } from "express";
import { ApiError, AuthenticationError, ValidationError } from "../errors/error";
import { EVENT_TO_ENGINE_SUBJECT } from "@workspace/types";
import { AddMarketAssetClientSchema, AddMarketClientSchema, GetMarketByIdClientSchema, UpdateMarketClientSchema } from "@workspace/validations";
import { requestEngine } from "../utils/engine-request";

// const natsPromise = NatsManager.getInstance();

export const getMarkets: RequestHandler = async (request: Request, response: Response) => {

    // const nats = await natsPromise;
    // const res = await nats.request<GetMarketsReturnPayload>(EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL);
    const res = await requestEngine(EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL);

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });

}

export const getAssets: RequestHandler = async (request: Request, response: Response) => {

    // const nats = await natsPromise;
    // const res = await nats.request<GetAssetsReturnPayload>(EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL_ASSET);
    const res = await requestEngine(EVENT_TO_ENGINE_SUBJECT.MARKET_GET_ALL_ASSET);

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });

}

export const getMarketById: RequestHandler = async (request: Request, response: Response) => {
    const params = request.params;

    const validateData = GetMarketByIdClientSchema.safeParse({ ...params });

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { marketId } = validateData.data;

    // const nats = await natsPromise;
    // const res = await nats.request<GetMarketByIdReturnPayload, GetMarketByIdPayload>(
    //     EVENT_TO_ENGINE_SUBJECT.MARKET_GET, { marketId }
    // );
    const res = await requestEngine(EVENT_TO_ENGINE_SUBJECT.MARKET_GET, { marketId });

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

    // const nats = await natsPromise;
    // const res = await nats.request<AddMarketReturnPayload, AddMarketPayload>(
    //     EVENT_TO_ENGINE_SUBJECT.MARKET_ADD,
    //     { userId, market: { ...market, id: `${market.baseAssetId}_${market.quoteAssetId}` } }
    // );
    const res = await requestEngine(EVENT_TO_ENGINE_SUBJECT.MARKET_ADD, {
        userId,
        market: { ...market, id: `${market.baseAssetId}_${market.quoteAssetId}` },
    });

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

    // const nats = await natsPromise;
    // const res = await nats.request<UpdateMarketReturnPayload, UpdateMarketPayload>(
    //     EVENT_TO_ENGINE_SUBJECT.MARKET_UPDATE,
    //     { userId, marketId, market }
    // );
    const res = await requestEngine(EVENT_TO_ENGINE_SUBJECT.MARKET_UPDATE, { userId, marketId, market });

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

    // const nats = await natsPromise;
    // const res = await nats.request<DeleteMarketReturnPayload, DeleteMarketPayload>(
    //     EVENT_TO_ENGINE_SUBJECT.MARKET_DELETE,
    //     { userId, marketId }
    // );
    const res = await requestEngine(EVENT_TO_ENGINE_SUBJECT.MARKET_DELETE, { userId, marketId });

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });
}

export const addAsset: RequestHandler = async (request: Request, response: Response) => {
    const body = request.body;

    // const userId = request.userId;
    const userId = "1243";

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = AddMarketAssetClientSchema.safeParse({ userId, ...body });

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { asset, assetSide } = validateData.data;

    // const nats = await natsPromise;
    // const res = await nats.request<BaseReturnPayloadWithUser, AddMarketAssetPayload>(
    //     EVENT_TO_ENGINE_SUBJECT.MARKET_ADD_ASSET,
    //     { userId, asset: { ...asset, id: asset.symbol }, assetSide }
    // );
    const res = await requestEngine(EVENT_TO_ENGINE_SUBJECT.MARKET_ADD_ASSET, {
        userId,
        asset: { ...asset, id: asset.symbol },
        assetSide,
    });

    if (!res.success) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
    });
}
