// notification.routes.js
import { Router } from "express";
import { 
  getMyNotifications, 
  deleteAllMessageNotifications,
  deleteNotification,
  getUnreadCount
} from "../controllers/notification.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

// ✅ GET routes
router.get("/", protect, getMyNotifications);
router.get("/unread-count", protect, getUnreadCount); // ⚠️ Changed from /unread/count

// ✅ DELETE routes - specific before generic
router.delete("/messages/all", protect, deleteAllMessageNotifications);
router.delete("/:notificationId", protect, deleteNotification);

export default router;