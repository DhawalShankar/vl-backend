import cron from "node-cron";
import Job from "../models/Job.js";

const scheduleJobExpiry = () => {
  // Run at midnight every day: '0 0 * * *'
  // For testing, you can use '*/5 * * * *' to run every 5 minutes
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('Running scheduled job expiry check...');
      const result = await Job.markExpiredJobs();
      console.log(`✅ Marked ${result.modifiedCount} jobs as expired`);
    } catch (error) {
      console.error('❌ Error in scheduled job expiry:', error);
    }
  });

  console.log('📅 Job expiry scheduler initialized - runs daily at midnight');
};

const scheduleJobCleanup = () => {
  // Run weekly on Sunday at 2 AM: '0 2 * * 0'
  cron.schedule('0 2 * * 0', async () => {
    try {
      console.log('Running scheduled job cleanup...');
      
      // Delete jobs expired for more than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await Job.deleteMany({
        status: 'expired',
        expiryDate: { $lt: thirtyDaysAgo }
      });

      console.log(`🗑️  Cleaned up ${result.deletedCount} old expired jobs`);
    } catch (error) {
      console.error('❌ Error in scheduled job cleanup:', error);
    }
  });

  console.log('🗑️  Job cleanup scheduler initialized - runs weekly on Sundays at 2 AM');
};

/**
 * Schedule cron job to clean up old expired jobs
 * Runs once a week on Sunday at 2 AM
 * Deletes jobs that have been expired for more than 30 days
 */
/**
 * Initialize all job schedulers
 */
const initializeJobSchedulers = () => {
  scheduleJobExpiry();
  scheduleJobCleanup();
};

export { initializeJobSchedulers };
