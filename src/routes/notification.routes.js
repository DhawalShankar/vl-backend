// notification.routes.js
import { Router } from "express";
import { 
  getMyNotifications, 
  markAsRead, 
  markAllAsRead,
  deleteNotification,
  getUnreadCount
} from "../controllers/notification.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", protect, getMyNotifications);
router.get("/unread-count", protect, getUnreadCount);
router.patch("/:notificationId/read", protect, markAsRead);
router.patch("/mark-all-read", protect, markAllAsRead);
router.delete("/:notificationId", protect, deleteNotification);

export default router;