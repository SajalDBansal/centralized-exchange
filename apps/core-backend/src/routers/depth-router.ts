import { Router } from "express";
import * as depthController from "../controllers/depth-controller";
import { asyncHandler } from "../utils/async-wrapper";

const depthRouter: Router = Router();

depthRouter.get("/:marketId", asyncHandler(depthController.getDepthByMarket));

export default depthRouter;