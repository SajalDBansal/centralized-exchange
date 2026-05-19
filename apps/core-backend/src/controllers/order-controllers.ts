import type { RequestHandler, Request, Response } from "express";
import { ApiError, AuthenticationError, ValidationError } from "../errors/error";
import { NatsManager } from "@workspace/nats-streams";
import { CancelOrderPayload, CancelOrderReturnPayload, CreateOrderPayload, CreateOrderReturnPayload, GetOrderByIdPayload, GetOrderByIdReturnPayload, GetUserOpenOrdersPayload, GetUserOpenOrdersReturnPayload, NATS_INCOMING_SUBJECT } from "@workspace/types";
import { CancelOrGetOrderClientSchema, CreateOrderClientSchema, GetOpenOrdersClientSchema } from "@workspace/validations";
import { prisma } from "@workspace/database";

const natsPromise = NatsManager.getInstance();

export const createOrder: RequestHandler = async (request: Request, response: Response) => {
    const body = request.body;

    const userId = request.userId;

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = CreateOrderClientSchema.safeParse(body);

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { marketId, entryPrice, quantity, side, position, leverage, type, postOnly, marketType, margin, reduceOnly, stpMode, timeInForce } = validateData.data;

    const nats = await natsPromise;

    const res = await nats.request<CreateOrderReturnPayload, CreateOrderPayload>(
        NATS_INCOMING_SUBJECT.ORDER_CREATE,
        {
            entryPrice, quantity, userId, marketId,
            side, type, postOnly, stpMode, position,
            timeInForce, createdAt: Date.now(),
            reduceOnly, margin, leverage, marketType
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

    const nats = await natsPromise;

    const res = await nats.request<CancelOrderReturnPayload, CancelOrderPayload>(
        NATS_INCOMING_SUBJECT.ORDER_CANCEL,
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

    const nats = await natsPromise;

    const res = await nats.request<GetOrderByIdReturnPayload, GetOrderByIdPayload>(
        NATS_INCOMING_SUBJECT.ORDER_GET,
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

    const nats = await natsPromise;

    const res = await nats.request<GetUserOpenOrdersReturnPayload, GetUserOpenOrdersPayload>(
        NATS_INCOMING_SUBJECT.ORDER_OPEN_ORDERS,
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
