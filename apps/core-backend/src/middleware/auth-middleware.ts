import { Request, Response, NextFunction } from "express";
import { verifyJWTToken } from "../utils/verify-token";


export const requireAuth = (request: Request, reponse: Response, next: NextFunction): void => {
    const authHeader = request.headers.authorization;


    if (!authHeader) { return; }



    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        return;
    }

    const { userId, sessionId } = verifyJWTToken(token, "ACCESS");
    request.userId = userId;
    request.sessionId = sessionId;
    next();
}


export const requireAdminAuth = (request: Request, reponse: Response, next: NextFunction): void => {
    const authHeader = request.headers.authorization;


    if (!authHeader) { return; }



    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        return;
    }

    const { userId, sessionId } = verifyJWTToken(token, "ACCESS");
    request.userId = userId;
    request.sessionId = sessionId;
    next();
}