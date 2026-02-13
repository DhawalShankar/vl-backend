// routes/job.routes.js
import express from 'express';
import {
  getJobStats,
  getJobListings,
  getJobById,
  createJob,
  incrementJobViews,
  markExpiredJobs,
  getAvailableLanguages,
  deleteJob,
  getMyJobs
} from '../controllers/job.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public routes
router.get('/stats', getJobStats);
router.get('/listings', getJobListings);
router.get('/languages', getAvailableLanguages);
router.get('/:id', getJobById);
router.post('/:id/view', incrementJobViews);

// Protected routes
router.post('/listings', protect, createJob);
router.delete('/:id', protect, deleteJob);
router.get('/my/jobs', protect, getMyJobs);  // ✅ FIX: Route order matters!

// Admin/Cron routes
router.post('/mark-expired', markExpiredJobs);

export default router;