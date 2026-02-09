// routes/job.routes.js - WITH AUTHENTICATION
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
import { protect } from '../middlewares/auth.middleware.js';  // ← IMPORT AUTH MIDDLEWARE

const router = express.Router();

// Public routes (no auth required)
router.get('/stats', getJobStats);
router.get('/listings', getJobListings);
router.get('/languages', getAvailableLanguages);
router.get('/:id', getJobById);
router.post('/:id/view', incrementJobViews);

// ✅ PROTECTED routes (auth required)
router.post('/listings', protect, createJob);        // ← CREATE JOB
router.delete('/:id', protect, deleteJob);           // ← DELETE JOB
router.get('/my/jobs', protect, getMyJobs);          // ← GET MY JOBS

// Admin/Cron routes
router.post('/mark-expired', markExpiredJobs);

export default router;