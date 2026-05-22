import { Router } from "express";
import authRouter from "./auth-router";
import userRouter from "./user-router";
import orderRouter from "./order-router";
import { requireAuth } from "../middleware/auth-middleware";
import depthRouter from "./depth-router";
import healthRouter from "./health-router";
import marketRouter from "./market-router";

const appRouter: Router = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/market", marketRouter);
appRouter.use("/user", requireAuth, userRouter);
appRouter.use("/order", requireAuth, orderRouter);
appRouter.use("/depth", requireAuth, depthRouter);
appRouter.use("/health", healthRouter);
// appRouter.use("/position", userRouter);
// appRouter.use("/trade", userRouter);


export default appRouter;

