// models/Chat.js
import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },

  // ✅ NEW: populated only if the recipient had translation enabled
  // when this message was sent. null/absent = no translation available.
  translatedText: { type: String, default: null },
  translatedLang: { type: String, default: null }
});

const ChatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  messages: [MessageSchema],
  blockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  lastMessage: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Ensure unique chat between two users
ChatSchema.index({ participants: 1 });

export default mongoose.model("Chat", ChatSchema);