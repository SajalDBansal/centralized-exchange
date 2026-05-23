import { Router } from "express";
import * as marketController from "../controllers/market-controllers";
import { asyncHandler } from "../utils/async-wrapper";
import { requireAdminAuth, requireAuth } from "../middleware/auth-middleware";

const marketRouter: Router = Router();

marketRouter.get("/", asyncHandler(marketController.getMarkets));
marketRouter.get("/assets", asyncHandler(marketController.getAssets));
marketRouter.get("/:marketId", asyncHandler(marketController.getMarketById));
marketRouter.post("/", requireAdminAuth, asyncHandler(marketController.addMarket));
marketRouter.post("/asset", requireAdminAuth, asyncHandler(marketController.addAsset));
marketRouter.put("/:marketId", requireAdminAuth, asyncHandler(marketController.updateMarket));
marketRouter.delete("/:marketId", requireAdminAuth, asyncHandler(marketController.deleteMarket));

export default marketRouter;