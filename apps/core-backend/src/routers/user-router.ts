import { Router } from "express";
import { asyncHandler } from "../utils/async-wrapper";
import * as userController from "../controllers/user-controllers";

const userRouter: Router = Router();

userRouter.get("/", asyncHandler(userController.me));
userRouter.post("/", asyncHandler(userController.updateProfile));

userRouter.get("/get-balance", asyncHandler(userController.getBalance));
userRouter.post("/add-balance", asyncHandler(userController.addBalance));
userRouter.post("/withdraw-balnce", asyncHandler(userController.withdrawBalance));

export default userRouter;