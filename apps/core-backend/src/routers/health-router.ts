import { Router } from "express";
import { asyncHandler } from "../utils/async-wrapper";
import * as healthController from "../controllers/health-controller";

const healthRouter: Router = Router();

// Engines
healthRouter.get("/core-backend", asyncHandler(healthController.coreBackendHealth));
healthRouter.get("/market-engine", asyncHandler(healthController.marketEngineHealth));

healthRouter.get("/redis-stream", asyncHandler(healthController.redisStreamHealth));
healthRouter.get("/nats-stream", asyncHandler(healthController.natsStreamHealth));

healthRouter.get("/ws-engine", asyncHandler(healthController.wsServerHealth));
healthRouter.get("/ws-market-poller", asyncHandler(healthController.wsMarketPricePollerHealth));
healthRouter.get("/database-engine", asyncHandler(healthController.databaseEngineHealth));
healthRouter.get("/postgres", asyncHandler(healthController.postgreseHealth));

healthRouter.get("/core-frontend", asyncHandler(healthController.coreFrontendCheck));
healthRouter.get("/docs-frontend", asyncHandler(healthController.docsFrontendCheck));
healthRouter.get("/debug-frontend", asyncHandler(healthController.debugFrontendCheck));

export default healthRouter;