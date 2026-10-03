import { Router } from "express";
import { signup, login, getMe, updateProfile,  googleSignup, 
  googleLogin, getUserById
} from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { forgotPassword, resetPassword } from "../controllers/authController.js"; // apna path/name


const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/update-profile", protect, updateProfile);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post('/google-signup', googleSignup);
router.post('/google-login', googleLogin);
router.get('/user/:userId', protect, getUserById);
export default router;
