import { Router } from "express";
import { signup, login, getMe, updateProfile } from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/update-profile", protect, updateProfile);
// Google Signup (naye users)
router.post('/google-signup', authController.googleSignup);
// Google Login (existing users)
router.post('/google-login', authController.googleLogin);
export default router;
