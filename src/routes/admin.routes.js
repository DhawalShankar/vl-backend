// src/routes/admin.routes.js
import express from 'express';
import {
  getAllJobs,
  extendJobDuration,
  deleteAnyJob,
  getPlatformStats,
  checkAdminStatus,
  getAllUsers
} from '../controllers/admin.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/admin.middleware.js';

const router = express.Router();

// ✅ Check admin status (only needs auth, not admin access)
router.get('/check', protect, checkAdminStatus);

// ✅ All routes below require admin access
router.get('/stats', protect, adminOnly, getPlatformStats);
router.get('/jobs', protect, adminOnly, getAllJobs);
router.get('/users', protect, adminOnly, getAllUsers);
router.put('/jobs/:jobId/extend', protect, adminOnly, extendJobDuration);
router.delete('/jobs/:jobId', protect, adminOnly, deleteAnyJob);

export default router;