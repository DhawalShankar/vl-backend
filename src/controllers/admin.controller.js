// src/controllers/admin.controller.js
import Job from '../models/Job.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Match from '../models/Match.js';
import Report from '../models/Report.js';

// ✅ Get all reports (admin only)
export const getReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'name email')
      .populate('reportedUser', 'name email')
      // ❌ Remove this - we only need the chatId string, not full chat object
      // .populate('chatId')
      .sort({ timestamp: -1 });
    
    res.json({ 
      success: true,
      reports,
      count: reports.length 
    });
  } catch (error) {
    console.error("Get reports error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch reports" 
    });
  }
};

// ✅ Delete report (mark as reviewed and delete)
export const deleteReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await Report.findByIdAndDelete(reportId);

    if (!report) {
      return res.status(404).json({ 
        success: false,
        error: "Report not found" 
      });
    }

    console.log(`🗑️ Admin deleted/reviewed report ${reportId}`);

    res.json({ 
      success: true,
      message: "Report reviewed and deleted successfully"
    });
  } catch (error) {
    console.error("Delete report error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete report" 
    });
  }
};

// ✅ OPTIONAL: Bulk delete all reports
export const deleteAllReports = async (req, res) => {
  try {
    const result = await Report.deleteMany({});

    console.log(`🗑️ Admin cleared ${result.deletedCount} reports`);

    res.json({ 
      success: true,
      message: `Deleted ${result.deletedCount} reports`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Delete all reports error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete reports" 
    });
  }
};

// ✅ Get single report details (for detailed review - with full chat context)
export const getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await Report.findById(reportId)
      .populate('reporter', 'name email languagesKnow primaryLanguageToLearn')
      .populate('reportedUser', 'name email languagesKnow primaryLanguageToLearn')
      .populate({
        path: 'chatId',
        populate: {
          path: 'participants',
          select: 'name email'
        }
      });

    if (!report) {
      return res.status(404).json({ 
        success: false,
        error: "Report not found" 
      });
    }

    res.json({ 
      success: true,
      report
    });
  } catch (error) {
    console.error("Get report error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch report" 
    });
  }
};
// ✅ Get all jobs (including expired)
export const getAllJobs = async (req, res) => {
  try {
    const jobs = await Job.find()
      .populate('postedBy', 'name email')
      .sort({ postedDate: -1 })
      .select('-__v');

    res.json({ 
      success: true, 
      jobs,
      count: jobs.length 
    });
  } catch (error) {
    console.error("Admin get jobs error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch jobs" 
    });
  }
};

// ✅ Extend job duration
export const extendJobDuration = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { days } = req.body;

    if (!days || days < 1 || days > 365) {
      return res.status(400).json({ 
        success: false, 
        error: "Please provide valid number of days (1-365)" 
      });
    }

    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        error: "Job not found" 
      });
    }

    // Extend expiry date
    const currentExpiry = new Date(job.expiryDate);
    currentExpiry.setDate(currentExpiry.getDate() + parseInt(days));
    
    job.expiryDate = currentExpiry;
    job.status = 'active'; // Reactivate if expired
    
    await job.save();

    console.log(`✅ Admin extended job ${jobId} by ${days} days`);

    res.json({ 
      success: true, 
      message: `Job extended by ${days} days`,
      job: {
        id: job._id,
        title: job.title,
        expiryDate: job.expiryDate,
        status: job.status,
        daysRemaining: Math.ceil((job.expiryDate - new Date()) / (1000 * 60 * 60 * 24))
      }
    });
  } catch (error) {
    console.error("Extend job error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to extend job" 
    });
  }
};

// ✅ Delete any job (admin power)
export const deleteAnyJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        error: "Job not found" 
      });
    }

    await job.deleteOne();

    console.log(`🗑️  Admin deleted job: ${job.title}`);

    res.json({ 
      success: true, 
      message: "Job deleted successfully" 
    });
  } catch (error) {
    console.error("Admin delete job error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete job" 
    });
  }
};

// ✅ Get platform stats
export const getPlatformStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalJobs,
      activeJobs,
      expiredJobs,
      learners,
      teachers,
      totalMatches,
      totalChats
    ] = await Promise.all([
      User.countDocuments(),
      Job.countDocuments(),
      Job.countDocuments({ status: 'active', expiryDate: { $gt: new Date() } }),
      Job.countDocuments({ status: 'expired' }),
      User.countDocuments({ primaryRole: 'learner' }),
      User.countDocuments({ primaryRole: 'teacher' }),
      Match.countDocuments(),
      Chat.countDocuments()
    ]);

    // Recent users (last 10)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name email createdAt primaryRole authProvider');

    // Recent jobs (last 10)
    const recentJobs = await Job.find()
      .sort({ postedDate: -1 })
      .limit(10)
      .populate('postedBy', 'name email')
      .select('title companyName language status postedDate expiryDate views');

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          learners,
          teachers
        },
        jobs: {
          total: totalJobs,
          active: activeJobs,
          expired: totalJobs - activeJobs
        },
        engagement: {
          matches: totalMatches,
          chats: totalChats
        },
        recent: {
          users: recentUsers,
          jobs: recentJobs
        }
      }
    });
  } catch (error) {
    console.error("Platform stats error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch stats" 
    });
  }
};

// ✅ Check if current user is admin
export const checkAdminStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('email name');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        isAdmin: false 
      });
    }

    const isAdmin = user.email.toLowerCase() === 'cosmoindiaprakashan@gmail.com';

    res.json({ 
      success: true, 
      isAdmin,
      user: isAdmin ? {
        name: user.name,
        email: user.email
      } : null
    });
  } catch (error) {
    console.error("Admin check error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Server error" 
    });
  }
};

// ✅ Get all users (for admin view)
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select('-password')
      .limit(100); // Limit for performance

    res.json({
      success: true,
      users,
      count: users.length
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch users"
    });
  }
};
