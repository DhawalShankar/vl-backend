// notification.controller.js
import Notification from "../models/Notification.js";

export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    const notifications = await Notification.find({
      recipient: userId
    })
    .populate('sender', 'name languagesKnow primaryLanguageToLearn')
    .populate('matchId')
    .populate('chatId')
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({ notifications });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;

    const result = await Notification.deleteOne({
      _id: notificationId,
      recipient: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification deleted" });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
};

// Delete all message notifications (for when visiting chats page)
export const deleteAllMessageNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await Notification.deleteMany({
      recipient: userId,
      type: "new_message"
    });
    
    console.log(`✅ Deleted ${result.deletedCount} message notifications for user ${userId}`);
    
    res.json({ 
      message: "All message notifications deleted",
      count: result.deletedCount
    });
  } catch (error) {
    console.error("Delete all message notifications error:", error);
    res.status(500).json({ error: "Failed to delete message notifications" });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const count = await Notification.countDocuments({
      recipient: userId
    });

    res.json({ count });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ error: "Failed to get unread count" });
  }
};