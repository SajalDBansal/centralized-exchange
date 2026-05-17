import { Router } from "express";
import * as authController from "../controllers/auth-controllers";
import { asyncHandler } from "../utils/async-wrapper";
import { requireAuth } from "../middleware/auth-middleware";

const authRouter: Router = Router();

authRouter.post("/signup", asyncHandler(authController.signup));
authRouter.post("/signin", asyncHandler(authController.signin));
authRouter.get("/signout", requireAuth, asyncHandler(authController.signout));
authRouter.get("/signout-all", requireAuth, asyncHandler(authController.signoutAll));

authRouter.get("/refresh", requireAuth, asyncHandler(authController.refresh));

authRouter.post("/verify-otp", asyncHandler(authController.verifyOTP));
authRouter.post("/resend-otp", asyncHandler(authController.resendOTP));

authRouter.post("/forgot-password", asyncHandler(authController.forgotPassword));
authRouter.post("/reset-password", asyncHandler(authController.resetPassword));
authRouter.post("/change-password", requireAuth, asyncHandler(authController.changePassword));

authRouter.delete("/archive-account", requireAuth, asyncHandler(authController.archiveAccount));


export default authRouter;