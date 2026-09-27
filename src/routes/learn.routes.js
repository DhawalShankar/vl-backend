// routes/learn.routes.js
import express from "express";
import {
  getLanguages,
  getLanguageBySlug,
  getAllLanguagesAdmin,
  createLanguage,
  updateLanguage,
  deleteLanguage,
  addResource,
  updateResource,
  deleteResource
} from "../controllers/learn.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { adminOnly } from "../middlewares/admin.middleware.js";

const router = express.Router();

// Public routes
router.get("/", getLanguages);
router.get("/admin/all", protect, adminOnly, getAllLanguagesAdmin); // must come before /:slug
router.get("/:slug", getLanguageBySlug);

// Admin routes
router.post("/", protect, adminOnly, createLanguage);
router.put("/:id", protect, adminOnly, updateLanguage);
router.delete("/:id", protect, adminOnly, deleteLanguage);
router.post("/:id/resources", protect, adminOnly, addResource);
router.put("/:id/resources/:resourceId", protect, adminOnly, updateResource);
router.delete("/:id/resources/:resourceId", protect, adminOnly, deleteResource);

export default router;