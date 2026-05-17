import { Router } from "express";
import authRouter from "./auth-router";
import userRouter from "./user-router";
import orderRouter from "./order-router";

const appRouter: Router = Router();

// appRouter.use("/health", userRouter);
appRouter.use("/auth", authRouter);
appRouter.use("/user", userRouter);
appRouter.use("/order", orderRouter);
// appRouter.use("/depth", userRouter);
// appRouter.use("/position", userRouter);
// appRouter.use("/trade", userRouter);


export default appRouter;

