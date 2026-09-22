// notification.routes.js
import { Router } from "express";
import { 
  getMyNotifications, 
  deleteAllMessageNotifications,
  deleteNotification,
  getUnreadCount,
  clearAllChatNotifications,   // ✅ ADD
  deleteChatNotifications      // ✅ ADD
} from "../controllers/notification.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

// ✅ GET routes
router.get("/", protect, getMyNotifications);
router.get("/unread-count", protect, getUnreadCount);

// ✅ DELETE routes - specific before generic
router.delete("/messages/all", protect, deleteAllMessageNotifications);
router.delete("/clear-all-chat", protect, clearAllChatNotifications);   // ✅ ADD
router.delete("/chat/:chatId", protect, deleteChatNotifications);        // ✅ ADD
router.delete("/:notificationId", protect, deleteNotification);          // stays LAST — catch-all

export default router;