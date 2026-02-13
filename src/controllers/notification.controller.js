// controllers/notification.controller.js - FIXED VERSION
import Notification from "../models/Notification.js";
import Match from "../models/Match.js";

/**
 * Get all notifications for the current user
 */
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, skip = 0, type } = req.query;

    const query = { recipient: userId };
    if (type) {
      query.type = type;
    }

    const notifications = await Notification.find(query)
      .populate('sender', 'name languagesKnow primaryLanguageToLearn')
      .populate('matchId')
      .populate('chatId')
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    console.log(`📥 Fetched ${notifications.length} notifications for user ${userId}`);

    res.json({ 
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const count = await Notification.countDocuments({
      recipient: userId
    });

    console.log(`🔢 User ${userId} has ${count} notifications`);

    res.json({ count });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ error: "Failed to get unread count" });
  }
};

/**
 * Delete a single notification by ID
 */
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;

    if (!notificationId || notificationId === 'undefined' || notificationId === 'null') {
      return res.status(400).json({ error: "Invalid notification ID" });
    }

    const result = await Notification.deleteOne({
      _id: notificationId,
      recipient: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    console.log(`🗑️ User ${userId} deleted notification ${notificationId}`);

    res.json({ 
      message: "Notification deleted",
      notificationId 
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
};

/**
 * Delete all notifications AND auto-reject pending match requests
 * Called when user clicks "Clear all"
 */
export const deleteAllMessageNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    console.log(`🧹 Clearing all notifications for user ${userId}...`);
    
    // ✅ Get all match_request notifications
    const matchNotifs = await Notification.find({
      recipient: userId,
      type: "match_request"
    });

    console.log(`📋 Found ${matchNotifs.length} pending match requests`);

    // ✅ Auto-reject all pending matches
    let rejectedCount = 0;
    for (const notif of matchNotifs) {
      if (notif.matchId) {
        try {
          const match = await Match.findById(notif.matchId);
          if (match && match.status === 'pending') {
            match.status = 'rejected';
            await match.save();
            rejectedCount++;
            console.log(`🚫 Auto-rejected match ${notif.matchId}`);
          }
        } catch (err) {
          console.error(`❌ Failed to reject match ${notif.matchId}:`, err);
        }
      }
    }

    // ✅ Delete ALL notifications for this user
    const result = await Notification.deleteMany({
      recipient: userId
    });
    
    console.log(`✅ Deleted ${result.deletedCount} notifications`);
    console.log(`✅ Auto-rejected ${rejectedCount} pending matches`);
    
    res.json({ 
      message: "All notifications cleared and pending matches rejected",
      count: result.deletedCount,
      rejectedMatches: rejectedCount
    });
  } catch (error) {
    console.error("Clear all notifications error:", error);
    res.status(500).json({ error: "Failed to clear notifications" });
  }
};