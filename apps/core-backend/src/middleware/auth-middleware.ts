import { Request, Response, NextFunction } from "express";
import { verifyJWTToken } from "../utils/verify-token";
import { AuthenticationError } from "../errors/error";


export const requireAuth = (request: Request, reponse: Response, next: NextFunction): void => {
    const authHeader = request.headers.authorization;

    if (!authHeader) throw new AuthenticationError("Access Token not available", 403, "TOKEN_UNAVAILABLE");

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        throw new AuthenticationError("Access Token not available", 403, "TOKEN_UNAVAILABLE");
    }

    const { userId, sessionId } = verifyJWTToken(token, "ACCESS");
    request.userId = userId;
    request.sessionId = sessionId;
    next();
}


export const requireAdminAuth = (request: Request, reponse: Response, next: NextFunction): void => {
    const authHeader = request.headers.authorization;

    if (!authHeader) throw new AuthenticationError("Access Token not available", 403, "TOKEN_UNAVAILABLE");

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        throw new AuthenticationError("Access Token not available", 403, "TOKEN_UNAVAILABLE");
    }

    const { userId, sessionId } = verifyJWTToken(token, "ACCESS");
    request.userId = userId;
    request.sessionId = sessionId;
    next();
}
