// models/Notification.js - FIXED VERSION
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
    ref: "Match",
    required: function() {
      return ['match_request', 'match_accepted', 'match_rejected'].includes(this.type);
    }
  },
  
  chatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Chat",
    required: function() {
      return this.type === 'new_message';
    }
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
NotificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, read: 1 });
NotificationSchema.index({ matchId: 1 });
NotificationSchema.index({ chatId: 1 });

// ✅ FIXED: Proper pre-save hook
NotificationSchema.pre('save', function(next) {
  console.log(`🔔 Creating notification: ${this.type} for ${this.recipient}`);
  next(); // ✅ Always call next()
});

// ✅ FIXED: Proper post-save success hook
NotificationSchema.post('save', function(doc) {
  console.log(`✅ Notification saved: ${doc._id}`);
});

// ✅ REMOVED: The broken error handler that was causing "next is not a function"
// The error handler middleware signature is different and was causing issues

// Static methods
NotificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId, read: false });
};

NotificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { recipient: userId, read: false },
    { read: true }
  );
};

NotificationSchema.statics.deleteAllMessages = async function(userId) {
  return this.deleteMany({
    recipient: userId,
    type: "new_message"
  });
};

NotificationSchema.statics.deleteByMatch = async function(matchId) {
  return this.deleteMany({ matchId });
};

// Instance methods
NotificationSchema.methods.markAsRead = async function() {
  this.read = true;
  return this.save();
};

NotificationSchema.methods.isExpired = function() {
  return this.expiresAt && this.expiresAt < new Date();
};

export default mongoose.model("Notification", NotificationSchema);