import type { RequestHandler, Request, Response } from "express";
import { ApiError, AuthenticationError, ValidationError } from "../errors/error";
import { CancelOrderReturnPayload, CreateOrderReturnPayload, GetOrderByIdReturnPayload, GetUserOpenOrdersReturnPayload, EVENT_TO_ENGINE_SUBJECT, EventSource, PayloadToBackendType, PayloadToEngineType } from "@workspace/types";
import { CancelOrGetOrderClientSchema, CreateOrderClientSchema, GetOpenOrdersClientSchema } from "@workspace/validations";
import { prisma } from "@workspace/database";
import { backendRouter } from "../utils/backendResponseRouter";

async function requestEngine<TResponse extends PayloadToBackendType>(
    type: EVENT_TO_ENGINE_SUBJECT,
    payload: PayloadToEngineType
): Promise<TResponse> {
    const result = await backendRouter.request({
        source: EventSource.BACKEND,
        type,
        payload,
    });

    return result.payload as TResponse;
}

export const createOrder: RequestHandler = async (request: Request, response: Response) => {
    const body = request.body;

    const userId = request.userId;

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = CreateOrderClientSchema.safeParse(body);

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { marketId, entryPrice, quantity, side, position, leverage, type, postOnly, marketType, reduceOnly, stpMode, timeInForce } = validateData.data;

    const res = await requestEngine<CreateOrderReturnPayload>(
        EVENT_TO_ENGINE_SUBJECT.ORDER_CREATE,
        {
            entryPrice, quantity, userId, marketId,
            side, type, postOnly, stpMode, position,
            timeInForce, createdAt: Date.now(),
            reduceOnly, leverage, marketType
        }
    );

    if (!res.success) throw new ApiError(400, res.message);

    return response.status(200).json({
        message: res.message,
        success: res.success,
        order: res,
    });

}

export const cancelOrder: RequestHandler = async (request: Request, response: Response) => {
    const params = request.params;

    const userId = request.userId;

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = CancelOrGetOrderClientSchema.safeParse(params);

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { orderId } = validateData.data;

    const res = await requestEngine<CancelOrderReturnPayload>(
        EVENT_TO_ENGINE_SUBJECT.ORDER_CANCEL,
        { userId, orderId }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });
}

export const getAllOrderById: RequestHandler = async (request: Request, response: Response) => {
    const params = request.params;

    const userId = request.userId;

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = CancelOrGetOrderClientSchema.safeParse(params);

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { orderId } = validateData.data;

    const res = await requestEngine<GetOrderByIdReturnPayload>(
        EVENT_TO_ENGINE_SUBJECT.ORDER_GET,
        { orderId, userId }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });
}

export const getAllOpenOrderByMarket: RequestHandler = async (request: Request, response: Response) => {
    const params = request.params;

    const userId = request.userId;

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = GetOpenOrdersClientSchema.safeParse(params);

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { marketId } = validateData.data;

    const res = await requestEngine<GetUserOpenOrdersReturnPayload>(
        EVENT_TO_ENGINE_SUBJECT.ORDER_OPEN_ORDERS,
        { userId, marketId }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });
}

// DB Route
export const getAllOrderByMarket: RequestHandler = async (request: Request, response: Response) => {
    const params = request.params;

    const userId = request.userId;

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = GetOpenOrdersClientSchema.safeParse(params);

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { marketId } = validateData.data;

    const orders = await prisma.order.findMany({ where: { userId, marketId } })

    return response.status(200).json({
        success: true,
        message: "Orders fetched successfully",
        orders: orders
    });
}
