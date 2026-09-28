//utils/jobScheduler.js
import cron from "node-cron";
import Job from "../models/Job.js";

const TZ = { timezone: "Asia/Kolkata" };
const CLEANUP_AFTER_DAYS = 30;

// Mark jobs whose expiryDate has passed as "expired"
const runExpiryCheck = async () => {
  try {
    console.log("Running job expiry check...");
    const result = await Job.markExpiredJobs();
    console.log(`✅ Marked ${result.modifiedCount} jobs as expired`);
  } catch (error) {
    console.error("❌ Error in job expiry check:", error);
  }
};

// Delete jobs that expired more than CLEANUP_AFTER_DAYS ago.
// FIX: no longer depends on status === 'expired'. If the expiry cron
// was missed, status stays 'active' and the old query skipped those jobs.
const runJobCleanup = async () => {
  try {
    console.log("Running job cleanup...");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLEANUP_AFTER_DAYS);

    const result = await Job.deleteMany({ expiryDate: { $lt: cutoff } });
    console.log(`🗑️  Cleaned up ${result.deletedCount} old expired jobs`);
  } catch (error) {
    console.error("❌ Error in job cleanup:", error);
  }
};

const scheduleJobExpiry = () => {
  // Every day at midnight
  cron.schedule("0 0 * * *", runExpiryCheck, TZ);
  console.log("📅 Job expiry scheduler initialized - runs daily at midnight (IST)");
};

const scheduleJobCleanup = () => {
  // FIX: daily at 2 AM instead of weekly, so a missed run is only 1 day late
  cron.schedule("0 2 * * *", runJobCleanup, TZ);
  console.log("🗑️  Job cleanup scheduler initialized - runs daily at 2 AM (IST)");
};

/**
 * Initialize all job schedulers.
 * Also runs both tasks once on startup (catch-up), because on hosts that
 * sleep (e.g. Render free tier) the server may be down at the scheduled time.
 */
const initializeJobSchedulers = () => {
  scheduleJobExpiry();
  scheduleJobCleanup();

  // Catch-up run on every server start
  runExpiryCheck().then(runJobCleanup);
};

export { initializeJobSchedulers };