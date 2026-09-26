// src/routes/admin.routes.js
import express from 'express';
import {
  getAllJobs,
  extendJobDuration,
  deleteAnyJob,
  getPlatformStats,
  checkAdminStatus,
  getAllUsers,
  getReports,
  deleteReport,
  deleteAllReports,
  getReportById,
  resetConnection,
  getAllMatches
} from '../controllers/admin.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/admin.middleware.js';

const router = express.Router();

router.get('/check', protect, checkAdminStatus);

// ✅ Admin-only routes
router.get('/stats', protect, adminOnly, getPlatformStats);
router.get('/jobs', protect, adminOnly, getAllJobs);
router.get('/users', protect, adminOnly, getAllUsers);

// ✅ Reports routes
router.get('/reports', protect, adminOnly, getReports);
router.get('/reports/:reportId', protect, adminOnly, getReportById);
router.delete('/reports/:reportId', protect, adminOnly, deleteReport);
router.delete('/reports/bulk/all', protect, adminOnly, deleteAllReports);  // Careful!

// ✅ NEW: Reset a match + chat connection between two users
router.delete('/connections/:userId1/:userId2', protect, adminOnly, resetConnection);

router.put('/jobs/:jobId/extend', protect, adminOnly, extendJobDuration);
router.delete('/jobs/:jobId', protect, adminOnly, deleteAnyJob);
router.get('/matches', protect, adminOnly, getAllMatches); 

export default router;