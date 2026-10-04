// models/Chat.js
import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },

  // populated only if the recipient had translation enabled
  // when this message was sent. null/absent = no translation available.
  translatedText: { type: String, default: null },
  translatedLang: { type: String, default: null },
  // cached TTS audio, generated on first "pronounce" tap.
  // Base64-encoded audio data — simplest for now given low message volume;
  // move to object storage (S3/Cloudinary) + URL if this grows.
  audioData: { type: String, default: null },
  audioFormat: { type: String, default: null }
});

const ChatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  messages: [MessageSchema],
  blockedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // deletedBy = chat is hidden from this user's list.
  // Cleared automatically when a new message arrives.
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // clearedAt = per-user history cutoff. Messages at or before `at`
  // are never shown to that user, even after the chat is restored.
  clearedAt: [
    {
      _id: false,
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: { type: Date, default: Date.now }
    }
  ],
  lastMessage: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Ensure unique chat between two users
ChatSchema.index({ participants: 1 });

export default mongoose.model("Chat", ChatSchema);