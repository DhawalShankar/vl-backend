// src/controllers/admin.controller.js
import mongoose from 'mongoose';
import Job from '../models/Job.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Match from '../models/Match.js';
import Report from '../models/Report.js';
import Notification from '../models/Notification.js';

// ✅ Get all reports (admin only)
export const getReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'name email')
      .populate('reportedUser', 'name email')
      // We only need the chatId string, not the full chat object
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

// ✅ Get all matches that ever existed, with both users populated
export const getAllMatches = async (req, res) => {
  try {
    const matches = await Match.find()
      .populate('user1', 'name email')
      .populate('user2', 'name email')
      .sort({ createdAt: -1 });

    // Skip orphaned matches whose user was deleted (populate returns null).
    const validMatches = matches.filter((m) => m.user1 && m.user2);

    const matchesWithChatInfo = await Promise.all(
      validMatches.map(async (match) => {
        const chatExists = await Chat.exists({
          participants: { $all: [match.user1._id, match.user2._id] }
        });
        return {
          _id: match._id,
          user1: match.user1,
          user2: match.user2,
          status: match.status,
          createdAt: match.createdAt,
          hasChat: !!chatExists
        };
      })
    );

    res.json({
      success: true,
      matches: matchesWithChatInfo,
      count: matchesWithChatInfo.length
    });
  } catch (error) {
    console.error("Get all matches error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch matches"
    });
  }
};

// ✅ Reset connection between two users — full cleanup:
//   1. Match record(s)            (both user orders)
//   2. Chat + its messages        (messages are embedded in the Chat doc)
//   3. Notifications              (tied to the match(es), the chat, or sent
//                                  directly between the two users)
//   4. totalConnections counters  (decremented for both users, never below 0)
// Reports are intentionally KEPT: they are the admin's evidence and are
// reviewed/deleted separately from the Reports tab.
export const resetConnection = async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;

    if (!userId1 || !userId2) {
      return res.status(400).json({
        success: false,
        error: "Both user IDs are required"
      });
    }

    if (!mongoose.isValidObjectId(userId1) || !mongoose.isValidObjectId(userId2)) {
      return res.status(400).json({
        success: false,
        error: "Invalid user ID"
      });
    }

    if (userId1 === userId2) {
      return res.status(400).json({
        success: false,
        error: "User IDs must be different"
      });
    }

    // 1. Find the match doc(s) between the two users (either order).
    //    Keep the ids + statuses so we can clean up notifications precisely
    //    and know how many real connections to subtract from the counters.
    const matches = await Match.find({
      $or: [
        { user1: userId1, user2: userId2 },
        { user1: userId2, user2: userId1 }
      ]
    }).select('_id status');

    const matchIds = matches.map((m) => m._id);
    const acceptedCount = matches.filter((m) => m.status === 'accepted').length;

    // 2. Delete the chat (this also removes its embedded messages)
    const chat = await Chat.findOneAndDelete({
      participants: { $all: [userId1, userId2] }
    });
    const messagesDeleted = chat?.messages?.length ?? 0;

    // 3. Delete the matches
    const matchResult = await Match.deleteMany({ _id: { $in: matchIds } });

    // 4. Delete every notification linked to this connection:
    //    - anything tied to the deleted match(es) or chat (any type)
    //    - match/message notifications exchanged directly between the users
    const notifOr = [
      {
        type: { $in: ['match_request', 'match_accepted', 'match_rejected', 'new_message'] },
        $or: [
          { sender: userId1, recipient: userId2 },
          { sender: userId2, recipient: userId1 }
        ]
      }
    ];
    if (matchIds.length) notifOr.push({ matchId: { $in: matchIds } });
    if (chat) notifOr.push({ chatId: chat._id });

    const notifResult = await Notification.deleteMany({ $or: notifOr });

    // 5. Fix connection counters. Only accepted matches counted as connections,
    //    so subtract exactly that many, and never go below zero.
    let countersUpdated = 0;
    if (acceptedCount > 0) {
      const counterResult = await User.updateMany(
        { _id: { $in: [userId1, userId2] } },
        { $inc: { totalConnections: -acceptedCount } }
      );
      countersUpdated = counterResult.modifiedCount;

      // Clamp anything that went negative back to 0
      await User.updateMany(
        { _id: { $in: [userId1, userId2] }, totalConnections: { $lt: 0 } },
        { $set: { totalConnections: 0 } }
      );
    }

    console.log(
      `🔄 Admin reset connection between ${userId1} and ${userId2} — ` +
      `${matchResult.deletedCount} match(es), chat deleted: ${!!chat} ` +
      `(${messagesDeleted} messages), ${notifResult.deletedCount} notification(s), ` +
      `${countersUpdated} counter(s) updated`
    );

    res.json({
      success: true,
      message: "Connection reset successfully — users can match and chat again",
      matchesDeleted: matchResult.deletedCount,
      chatDeleted: !!chat,
      messagesDeleted,
      notificationsDeleted: notifResult.deletedCount,
      countersUpdated
    });
  } catch (error) {
    console.error("Reset connection error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset connection"
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
      learners,
      teachers,
      totalMatches,
      totalChats
    ] = await Promise.all([
      User.countDocuments(),
      Job.countDocuments(),
      Job.countDocuments({ status: 'active', expiryDate: { $gt: new Date() } }),
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
      .limit(500);

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