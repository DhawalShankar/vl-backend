import { Router } from "express";
import { signup, login, getMe, updateProfile,  googleSignup, 
  googleLogin, getUserById
} from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/update-profile", protect, updateProfile);
// ⬇️ NAYE ROUTES
router.post('/google-signup', googleSignup);
router.post('/google-login', googleLogin);
router.get('/user/:userId', protect, getUserById);
export default router;
