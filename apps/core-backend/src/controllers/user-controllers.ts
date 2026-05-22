import type { RequestHandler, Request, Response } from "express";
import { ApiError, AuthenticationError, ValidationError } from "../errors/error";
import { verifyJWTToken } from "../utils/verify-token";
import { prisma } from "@workspace/database";
import { NatsManager } from "@workspace/nats-streams";
import { GetUserBalancesPayload, GetUserBalancesReturnPayload, EVENT_TO_ENGINE_SUBJECT, OnRampPayload, OnRampReturnPayload } from "@workspace/types";
import { OnRampSchema } from "@workspace/validations";

const natsPromise = NatsManager.getInstance();

export const me: RequestHandler = async (request: Request, response: Response) => {
    const accessToken = request.headers["authorization"]?.split(" ")[1];

    if (!accessToken) throw new AuthenticationError("Access Token not available", 403, "TOKEN_UNAVAILABLE");

    const { userId } = verifyJWTToken(accessToken, "ACCESS");

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, email: true, createdAt: true, updatedAt: true, isVerified: true }
    });

    if (!user) throw new AuthenticationError("User Does not Exists", 403, "USER_UNAVAILABLE");

    return response.status(200).json({ success: true, message: "User fetched successfully", user });
}

export const updateProfile: RequestHandler = async (request: Request, response: Response) => { }

export const getBalance: RequestHandler = async (request: Request, response: Response) => {
    const nats = await natsPromise;

    const userId = request.userId;

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const res = await nats.request<GetUserBalancesReturnPayload, GetUserBalancesPayload>(
        EVENT_TO_ENGINE_SUBJECT.BALANCE_GET, { userId }
    );

    if (!res.success || !res.data) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
        data: res.data
    });
}

export const addBalance: RequestHandler = async (request: Request, response: Response) => {
    const body = request.body;
    const nats = await natsPromise;

    const userId = request.userId;

    if (!userId) throw new AuthenticationError("The userid is not present in the request headers", 403, "USER_ID_NOT_FOUND");

    const validateData = OnRampSchema.safeParse(body);

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { asset, amount } = validateData.data;

    const res = await nats.request<OnRampReturnPayload, OnRampPayload>(
        EVENT_TO_ENGINE_SUBJECT.ON_RAMP, { userId, asset, amount }
    );

    if (!res.success) throw new ApiError(400, res.message);

    return response.status(200).json({
        success: res.success,
        message: res.message,
    });
}

export const withdrawBalance: RequestHandler = async (request: Request, response: Response) => { }