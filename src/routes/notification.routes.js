// notification.routes.js
import { Router } from "express";
import { 
  getMyNotifications, 
  deleteAllMessageNotifications,
  deleteNotification,
  deleteNotificationsForChat, // ✅ NEW
  getUnreadCount
} from "../controllers/notification.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

// notification.routes.js
router.get("/", protect, getMyNotifications);
router.delete("/messages/all", protect, deleteAllMessageNotifications); 
router.get("/unread/count", protect, getUnreadCount);
router.delete("/:notificationId", protect, deleteNotification);
router.delete("/chat/:chatId", protect, deleteNotificationsForChat);

export default router;