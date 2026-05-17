import { NatsManager } from "@workspace/nats-streams";
import { BaseReturnPayload, NATS_INCOMING_SUBJECT } from "@workspace/types";
import type { Request, RequestHandler, Response } from "express";

// Servers check
const coreBackendHealth: RequestHandler = async (request: Request, response: Response) => {
    const start = process.hrtime.bigint();
    // work
    const latencyNs = process.hrtime.bigint() - start;
    const latencyMs = Number(latencyNs) / 1_000_000;
    return response.status(200).json({ message: "Core Backend Running", success: true, latency: latencyMs });
}

const marketEngineHealth: RequestHandler = async (request: Request, response: Response) => {
    const nats = await NatsManager.getInstance();

    try {
        const healthResponse = await nats.request<BaseReturnPayload>(NATS_INCOMING_SUBJECT.HEALTH_CHECK);

        if (!healthResponse.success) {
            return response.status(500).json({ success: false, message: "The market engine server is down" });
        }

        return response.status(200).json({ success: true, message: healthResponse.message });

    } catch (error) {

        return response.status(500).json({ success: false, message: "The market engine server is down", error: error });
    }
}

// UPDATE_ROUTE
const wsServerHealth: RequestHandler = async (request: Request, response: Response) => { }
const databaseEngineHealth: RequestHandler = async (request: Request, response: Response) => { }
const snapshotEngineHealth: RequestHandler = async (request: Request, response: Response) => { }

// Services check
const postgreseHealth: RequestHandler = async (request: Request, response: Response) => { }
const redisPubSubHealth: RequestHandler = async (request: Request, response: Response) => { }
const natsStreamHealth: RequestHandler = async (request: Request, response: Response) => { }
const s3BucketHealth: RequestHandler = async (request: Request, response: Response) => { }


export { coreBackendHealth, marketEngineHealth, wsServerHealth, databaseEngineHealth, snapshotEngineHealth };
export { postgreseHealth, redisPubSubHealth, natsStreamHealth, s3BucketHealth }