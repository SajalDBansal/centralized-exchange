import { AuthenticationError } from "../errors/error";
import config from "./config";
import jwt from "jsonwebtoken";

export const verifyJWTToken = (jwtToken: string, type: "ACCESS" | "REFRESH") => {
    try {
        let secret = "";
        switch (type) {
            case "ACCESS":
                secret = config.JWT_ACCESS_TOKEN
                break;
            case "REFRESH":
                secret = config.JWT_REFRESH_TOKEN
                break;
            default:
                break;
        }

        const decoded = jwt.verify(jwtToken, secret);

        if (typeof decoded !== "object" || !("userId" in decoded) || !("sessionId" in decoded)) {
            throw new AuthenticationError("JWT is not valid", 404, "JWT_UNVERIFIED");
        }

        return decoded as { userId: string, sessionId: string };
    } catch (err: any) {
        if (err.name === "TokenExpiredError") throw new AuthenticationError("JWT is expired", 404, "JWT_EXPIRED");;

        throw new AuthenticationError("JWT is not valid", 404, "JWT_UNVERIFIED");
    }
}