import { Router } from "express";
import * as authController from "../controllers/auth-controllers";
import { asyncHandler } from "../utils/async-wrapper";

const authRouter: Router = Router();

authRouter.post("/signup", asyncHandler(authController.signup));
authRouter.post("/signin", asyncHandler(authController.signin));
authRouter.get("/signout", asyncHandler(authController.signout));
authRouter.get("/signout-all", asyncHandler(authController.signoutAll));

authRouter.get("/refresh", asyncHandler(authController.refresh));

authRouter.post("/verify-otp", asyncHandler(authController.verifyOTP));
authRouter.post("/resend-otp", asyncHandler(authController.resendOTP));

authRouter.post("/forgot-password", asyncHandler(authController.forgotPassword));
authRouter.post("/reset-password", asyncHandler(authController.resetPassword));
authRouter.post("/change-password", asyncHandler(authController.changePassword));

authRouter.delete("/archive-account", asyncHandler(authController.archiveAccount));


export default authRouter;