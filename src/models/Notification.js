// models/Notification.js - SIMPLIFIED VERSION
import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true
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
      // Only required for match-related notifications
      return ['match_request', 'match_accepted', 'match_rejected'].includes(this.type);
    }
  },
  
  chatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Chat",
    required: function() {
      // Only required for message notifications
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
    default: false,
    index: true
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    immutable: true
  },
  
  expiresAt: { 
    type: Date, 
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    index: true
  }
}, {
  timestamps: false
});

// ✅ INDEXES for performance
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, read: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
NotificationSchema.index({ matchId: 1 });
NotificationSchema.index({ chatId: 1 });

// ✅ INSTANCE METHODS
NotificationSchema.methods.markAsRead = async function() {
  this.read = true;
  return this.save();
};

NotificationSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

// ✅ STATIC METHODS
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

// ✅ MIDDLEWARE - Simplified validation
NotificationSchema.pre('save', function(next) {
  console.log(`🔔 Pre-save hook: Creating ${this.type} notification`);
  console.log(`📝 Data:`, {
    recipient: this.recipient,
    sender: this.sender,
    type: this.type,
    matchId: this.matchId,
    chatId: this.chatId
  });
  next();
});

NotificationSchema.post('save', function(doc) {
  console.log(`✅ Notification saved successfully: ${doc._id}`);
  console.log(`📬 Type: ${doc.type} for user ${doc.recipient}`);
});

NotificationSchema.post('save', function(error, doc, next) {
  if (error) {
    console.error(`❌ Post-save error:`, error);
  }
  next(error);
});

export default mongoose.model("Notification", NotificationSchema);