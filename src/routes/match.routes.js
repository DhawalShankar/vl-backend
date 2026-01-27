import { Router } from "express";
import { 
  getPotentialMatches, 
  handleSwipe, 
  getMyMatches,
  acceptMatch,
  rejectMatch
} from "../controllers/match.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/potential", protect, getPotentialMatches);
router.post("/swipe", protect, handleSwipe);
router.get("/my-matches", protect, getMyMatches);
router.post("/:matchId/accept", protect, acceptMatch);
router.post("/:matchId/reject", protect, rejectMatch);

export default router;