// import { NatsManager } from "@workspace/nats-streams";
import { EVENT_TO_ENGINE_SUBJECT } from "@workspace/types";
import type { Request, RequestHandler, Response } from "express";
import { requestEngine } from "../utils/engine-request";
import { RedisManager } from "@workspace/redis-streams";

// Servers check
const coreBackendHealth: RequestHandler = async (request: Request, response: Response) => {
    const start = process.hrtime.bigint();
    // work
    const latencyNs = process.hrtime.bigint() - start;
    const latencyMs = Number(latencyNs) / 1_000_000;
    return response.status(200).json({ message: "Core Backend Running", success: true, latency: latencyMs });
}
const marketEngineHealth: RequestHandler = async (request: Request, response: Response) => {
    // NATS implementation retained for an easy transport rollback:
    // const nats = await NatsManager.getInstance();

    try {
        // const healthResponse = await nats.request<BaseReturnPayload>(EVENT_TO_ENGINE_SUBJECT.HEALTH_CHECK);
        const healthResponse = await requestEngine(EVENT_TO_ENGINE_SUBJECT.HEALTH_CHECK, {
            message: "core-backend health probe",
        });

        if (!healthResponse.success) {
            return response.status(500).json({ success: false, message: "The market engine server is down" });
        }

        return response.status(200).json({
            success: true,
            message: healthResponse.message,
            eventId: healthResponse.eventId,
            timestamp: healthResponse.timestamp,
        });

    } catch (error) {

        return response.status(500).json({ success: false, message: "The market engine server is down", error: error });
    }
}

// UPDATE_ROUTE
const wsServerHealth: RequestHandler = async (request: Request, response: Response) => {
    return response.status(200).json({ message: "WS Server Running", success: true, latency: "00" });
}
const databaseEngineHealth: RequestHandler = async (request: Request, response: Response) => {
    return response.status(200).json({ message: "Database Engine Running", success: true, latency: "00" });
}
const wsMarketPricePollerHealth: RequestHandler = async (request: Request, response: Response) => {
    return response.status(200).json({ message: "WS Poller Server Running", success: true, latency: "00" });
}

// Services check
const postgreseHealth: RequestHandler = async (request: Request, response: Response) => {
    return response.status(200).json({ message: "Postgres Service Running", success: true, latency: "00" });
}
const redisStreamHealth: RequestHandler = async (request: Request, response: Response) => {
    const startedAt = process.hrtime.bigint();

    try {
        const redis = await RedisManager.getInstance();
        const pong = await redis.ping();
        const latency = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        return response.status(200).json({
            message: "Redis stream transport running",
            success: pong === "PONG",
            latency,
        });
    } catch (error) {
        return response.status(500).json({
            message: "Redis stream transport unavailable",
            success: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
const natsStreamHealth: RequestHandler = async (request: Request, response: Response) => {
    return response.status(200).json({
        message: "NATS transport disabled; Redis streams are active",
        success: true,
        active: false,
    });
}

const coreFrontendCheck: RequestHandler = async (request: Request, response: Response) => {
    return response.status(200).json({ message: "Core Frontend Running", success: true, latency: "00" });
}

const docsFrontendCheck: RequestHandler = async (request: Request, response: Response) => {
    return response.status(200).json({ message: "Docs Frontend Running", success: true, latency: "00" });
}

const debugFrontendCheck: RequestHandler = async (request: Request, response: Response) => {
    return response.status(200).json({ message: "Debug Console Frontend Running", success: true, latency: "00" });
}

export { coreBackendHealth, marketEngineHealth, wsServerHealth, databaseEngineHealth, wsMarketPricePollerHealth };
export { postgreseHealth, redisStreamHealth, natsStreamHealth }
export { coreFrontendCheck, docsFrontendCheck, debugFrontendCheck }
