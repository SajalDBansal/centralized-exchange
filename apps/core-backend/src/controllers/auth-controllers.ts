import type { RequestHandler, Request, Response } from "express";
import { LoginUserSchema, RegisterUserSchema } from "@workspace/validations";
import { AuthenticationError, ValidationError } from "../errors/error";
import { prisma } from "@workspace/database";
import config from "../utils/config";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cuid from "cuid";
import { verifyJWTToken } from "../utils/verify-token";

export const signup: RequestHandler = async (request: Request, response: Response) => {
    const body = request.body;
    const validateData = RegisterUserSchema.safeParse(body);
    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { username, password, email } = validateData.data;

    const isUserExists = await prisma.user.findFirst({ where: { username, email } });

    if (isUserExists) throw new AuthenticationError("User Already Exists", 403, "USER_EXISTS");

    const passwordHash = await bcrypt.hash(password, config.BCRYPT_HASH);

    // TODO: Add verfication constraints here
    await prisma.user.create({ data: { username, passwordHash, email, isVerified: true } });

    return response.status(200).json({ success: true, message: "User Created Successfuly" });
}

export const signin: RequestHandler = async (request: Request, response: Response) => {
    const body = request.body;

    const validateData = LoginUserSchema.safeParse(body);

    if (!validateData.success) throw ValidationError.fromZod(validateData.error);

    const { username, password } = validateData.data;

    const isUserExists = await prisma.user.findFirst({ where: { username } });

    if (!isUserExists) throw new AuthenticationError("User Does not Exists", 403, "USER_UNAVAILABLE");

    const { id, passwordHash, email, isVerified, isArchived } = isUserExists;

    if (isArchived) throw new AuthenticationError("User is Deactivated", 403, "USER_DISABLED");

    if (!isVerified) throw new AuthenticationError("User is Unverified", 403, "USER_UNVERIFIED");

    const validatePassword = await bcrypt.compare(password, passwordHash);

    if (!validatePassword) throw new AuthenticationError("Password Does Not Match", 403, "UNAUTHORIZED_ACCESS");

    const sessionId = cuid();

    // refresh token to send to client side in cookie - longer persistance
    // token used to create access token
    const refreshToken = await jwt.sign({ userId: id, sessionId }, config.JWT_REFRESH_TOKEN, { expiresIn: "7d" });

    const refreshTokenHash = await bcrypt.hash(refreshToken, config.BCRYPT_HASH);

    const deviceIP = request.headers["x-forwarded-for"]?.toString() || request.socket.remoteAddress || "";
    const userAgent = request.headers['user-agent'] || "";

    await prisma.session.create({
        data: {
            id: sessionId,
            deviceIP,
            userAgent,
            refreshTokenHash,
            userId: id
        }
    })

    // access token to send to client side in res for authorization headers - shorter persistance
    // token used for making calls fetch from req headers
    const accessToken = await jwt.sign({ userId: id, sessionId }, config.JWT_ACCESS_TOKEN, { expiresIn: "15m" });

    response.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    })

    return response.status(200).json({
        success: true,
        message: "User logged in successfully",
        token: `Bearer ${accessToken}`,
        user: { id, username, email }
    })
}

export const signout: RequestHandler = async (request: Request, response: Response) => {
    const refreshToken = request.cookies.refreshToken as string | undefined;

    if (!refreshToken) throw new AuthenticationError("Refresh Token not available", 403, "TOKEN_UNAVAILABLE");

    const { sessionId } = verifyJWTToken(refreshToken, "REFRESH");

    const session = await prisma.session.findUnique({ where: { id: sessionId } });

    if (!session) throw new AuthenticationError("Session in not available", 403, "SESSION_UNAVAILABLE");

    await prisma.session.update({ where: { id: sessionId }, data: { revoke: true, revokeAt: new Date(Date.now()) } });

    response.clearCookie('refreshToken');

    return response.status(200).json({ success: true, message: "user logged out successfully" });
}

export const refresh: RequestHandler = async (request: Request, response: Response) => {
    const refreshToken = request.cookies.refreshToken as string | undefined;

    if (!refreshToken) throw new AuthenticationError("Refresh Token not available", 403, "TOKEN_UNAVAILABLE");

    const { userId, sessionId } = verifyJWTToken(refreshToken, "REFRESH");

    const session = await prisma.session.findUnique({ where: { id: sessionId } });

    if (!session) throw new AuthenticationError("Session in not available", 403, "SESSION_UNAVAILABLE");

    const isValidRefreshToken = await bcrypt.compare(refreshToken, session.refreshTokenHash);

    if (!isValidRefreshToken) throw new AuthenticationError("Provided Token in invalid", 403, "TOKEN_INVALID");

    const newAccessToken = await jwt.sign({ userId, sessionId }, config.JWT_ACCESS_TOKEN, { expiresIn: "15m" });

    const newRefreshToken = await jwt.sign({ userId, sessionId }, config.JWT_REFRESH_TOKEN, { expiresIn: "7d" });

    const refreshTokenHash = await bcrypt.hash(newRefreshToken, config.BCRYPT_HASH);

    await prisma.session.update({ where: { id: sessionId }, data: { refreshTokenHash } });

    response.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    })

    return response.status(200).json({
        success: true,
        message: "Access token refreshed successfully",
        token: `Bearer ${newAccessToken}`,
    })
}

// TODO: Add route logic
export const signoutAll: RequestHandler = async (request: Request, response: Response) => { }
export const verifyOTP: RequestHandler = async (request: Request, response: Response) => { }
export const resendOTP: RequestHandler = async (request: Request, response: Response) => { }
export const forgotPassword: RequestHandler = async (request: Request, response: Response) => { }
export const resetPassword: RequestHandler = async (request: Request, response: Response) => { }
export const changePassword: RequestHandler = async (request: Request, response: Response) => { }
export const archiveAccount: RequestHandler = async (request: Request, response: Response) => { }