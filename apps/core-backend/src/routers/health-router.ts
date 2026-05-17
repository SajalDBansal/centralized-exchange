import { Router } from "express";
import { asyncHandler } from "../utils/async-wrapper";
import * as healthController from "../controllers/health-controller";

const healthRouter: Router = Router();

// Engines
healthRouter.get("/core-backend", asyncHandler(healthController.coreBackendHealth));
healthRouter.get("/market-engine", asyncHandler(healthController.marketEngineHealth));
healthRouter.get("/ws-engine", asyncHandler(healthController.wsServerHealth));
healthRouter.get("/database-engine", asyncHandler(healthController.databaseEngineHealth));
healthRouter.get("/snapshot-engine", asyncHandler(healthController.snapshotEngineHealth));

// services
healthRouter.get("/postgres", asyncHandler(healthController.postgreseHealth));
healthRouter.get("/redis-pub-sub", asyncHandler(healthController.redisPubSubHealth));
healthRouter.get("/nats-stream", asyncHandler(healthController.natsStreamHealth));
healthRouter.get("/s3-bucket", asyncHandler(healthController.s3BucketHealth));

export default healthRouter;