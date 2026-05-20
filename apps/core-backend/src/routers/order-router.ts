import { Router } from "express";
import * as orderController from "../controllers/order-controllers";
import { asyncHandler } from "../utils/async-wrapper";

const orderRouter: Router = Router();

orderRouter.post("/", asyncHandler(orderController.createOrder));

orderRouter.get("/all/:market", asyncHandler(orderController.getAllOrderByMarket));
orderRouter.get("/open/:market", asyncHandler(orderController.getAllOpenOrderByMarket));

orderRouter.delete("/:orderId", asyncHandler(orderController.cancelOrder));
orderRouter.get("/:orderId", asyncHandler(orderController.getAllOrderById));

export default orderRouter;