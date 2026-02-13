// models/Notification.js
import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true
  },
  
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  
  type: { 
    type: String, 
    enum: ["match_request", "match_accepted", "match_rejected", "new_message"],
    required: true
  },
  
  matchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Match"
  },
  
  chatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Chat"
  },
  
  message: { 
    type: String,
    trim: true,
    maxlength: 500
  },
  
  read: { 
    type: Boolean, 
    default: false
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now
  }
});

// Indexes
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ matchId: 1 });

// Simple logging - NO HOOKS AT ALL
console.log("✅ Notification model loaded");

// Static methods
NotificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId });
};

NotificationSchema.statics.deleteAllMessages = async function(userId) {
  return this.deleteMany({
    recipient: userId,
    type: "new_message"
  });
};

export default mongoose.model("Notification", NotificationSchema);