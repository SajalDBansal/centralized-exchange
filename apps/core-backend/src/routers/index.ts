import { Router } from "express";
import authRouter from "./auth-router";
import userRouter from "./user-router";
import orderRouter from "./order-router";
import { requireAuth } from "../middleware/auth-middleware";
import { asyncHandler } from "../utils/async-wrapper";
import depthRouter from "./depth-router";
import healthRouter from "./health-router";

const appRouter: Router = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/user", requireAuth, userRouter);
appRouter.use("/order", requireAuth, orderRouter);
appRouter.use("/depth", requireAuth, depthRouter);
appRouter.use("/health", healthRouter);
// appRouter.use("/position", userRouter);
// appRouter.use("/trade", userRouter);


export default appRouter;

