// models/Notification.js
import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { 
    type: String, 
    enum: ["match_request", "match_accepted", "match_rejected", "new_message"], // ✅ Added "new_message"
    required: true 
  },
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match" }, // ✅ Made optional (removed required: true)
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" }, // ✅ Added for message notifications
  message: { type: String }, // ✅ Added for message preview
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(+new Date() + 30*24*60*60*1000) } // 30 days
});

NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Notification", NotificationSchema);