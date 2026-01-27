import { Router } from "express";
import { 
  getMyChats, 
  getChatMessages, 
  sendMessage, 
  blockUser, 
  unblockUser, 
  deleteChat,
  reportUser 
} from "../controllers/chat.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", protect, getMyChats);
router.get("/:chatId", protect, getChatMessages);
router.post("/:chatId/message", protect, sendMessage);
router.post("/:chatId/block", protect, blockUser);
router.post("/:chatId/unblock", protect, unblockUser);
router.delete("/:chatId", protect, deleteChat);
router.post("/:chatId/report", protect, reportUser);

export default router;