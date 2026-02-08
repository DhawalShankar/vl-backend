// job.routes.js
import { Router } from "express";
import {
  getJobStats,
  getJobListings,
  getJobById,
  createJob,
  incrementJobViews,
  markExpiredJobs,
  getAvailableLanguages,
  deleteJob
} from "../controllers/job.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/stats", getJobStats);
router.get("/listings", getJobListings);
router.get("/listings/:id", getJobById);
router.post("/listings", createJob);
router.post("/listings/:id/view", incrementJobViews);
router.get("/languages", getAvailableLanguages);

router.post("/mark-expired", protect, markExpiredJobs);
router.delete("/listings/:id", protect, deleteJob);

export default router;
