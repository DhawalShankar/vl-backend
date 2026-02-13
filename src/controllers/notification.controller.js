// notification.controller.js - Production Grade
import Notification from "../models/Notification.js";

/**
 * Get all notifications for the current user
 * Supports pagination and filtering
 */
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, skip = 0, type } = req.query;

    // Build query
    const query = { recipient: userId };
    if (type) {
      query.type = type;
    }

    // Fetch with populate
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

    console.log(`🔢 User ${userId} has ${count} unread notifications`);

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

    // Validate ID
    if (!notificationId || notificationId === 'undefined' || notificationId === 'null') {
      return res.status(400).json({ error: "Invalid notification ID" });
    }

    const result = await Notification.deleteOne({
      _id: notificationId,
      recipient: userId // Security: only delete own notifications
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
 * Delete all message notifications
 * Used when user visits chats page
 */
export const deleteAllMessageNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await Notification.deleteMany({
      recipient: userId,
      type: "new_message"
    });
    
    console.log(`🧹 Deleted ${result.deletedCount} message notifications for user ${userId}`);
    
    res.json({ 
      message: "All message notifications deleted",
      count: result.deletedCount
    });
  } catch (error) {
    console.error("Delete all message notifications error:", error);
    res.status(500).json({ error: "Failed to delete message notifications" });
  }
};

/**
 * Delete all notifications (optional - for testing)
 */
export const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await Notification.deleteMany({
      recipient: userId
    });
    
    console.log(`🧹 Deleted ${result.deletedCount} total notifications for user ${userId}`);
    
    res.json({ 
      message: "All notifications deleted",
      count: result.deletedCount
    });
  } catch (error) {
    console.error("Delete all notifications error:", error);
    res.status(500).json({ error: "Failed to delete all notifications" });
  }
};

/**
 * Mark notification as read (optional - for future use)
 */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipient: userId
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    console.log(`✅ Marked notification ${notificationId} as read for user ${userId}`);

    res.json({ 
      message: "Notification marked as read",
      notification
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
};

/**
 * Mark all notifications as read (optional - for future use)
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true }
    );
    
    console.log(`✅ Marked ${result.modifiedCount} notifications as read for user ${userId}`);
    
    res.json({ 
      message: "All notifications marked as read",
      count: result.modifiedCount
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
};