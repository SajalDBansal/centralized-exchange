import { Router } from "express";
import * as marketController from "../controllers/market-controllers";
import { asyncHandler } from "../utils/async-wrapper";

const marketRouter: Router = Router();

marketRouter.get("/", asyncHandler(marketController.getMarkets));
marketRouter.get("/:marketId", asyncHandler(marketController.getMarketById));
marketRouter.post("/", asyncHandler(marketController.addMarket));
marketRouter.post("/asset", asyncHandler(marketController.addAsset));
marketRouter.put("/:marketId", asyncHandler(marketController.updateMarket));
marketRouter.delete("/:marketId", asyncHandler(marketController.deleteMarket));

export default marketRouter;