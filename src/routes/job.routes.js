const express = require('express');
const router = express.Router();
const {
  getJobStats,
  getJobListings,
  getJobById,
  createJob,
  incrementJobViews,
  markExpiredJobs,
  getAvailableLanguages,
  deleteJob
} = require('../controllers/job.controller');

// Public routes
router.get('/stats', getJobStats);
router.get('/listings', getJobListings);
router.get('/listings/:id', getJobById);
router.post('/listings', createJob);
router.post('/listings/:id/view', incrementJobViews);
router.get('/languages', getAvailableLanguages);

// Admin/Protected routes (add authentication middleware as needed)
// Example: router.post('/mark-expired', authMiddleware, markExpiredJobs);
router.post('/mark-expired', markExpiredJobs);
router.delete('/listings/:id', deleteJob);

module.exports = router;