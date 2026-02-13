// models/Notification.js
import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true // ✅ Single field index for fast lookups
  },
  
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  
  type: { 
    type: String, 
    enum: {
      values: ["match_request", "match_accepted", "match_rejected", "new_message"],
      message: '{VALUE} is not a valid notification type'
    },
    required: [true, 'Notification type is required']
  },
  
  matchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Match",
    // ✅ Required for match-related notifications
    validate: {
      validator: function(value) {
        const matchTypes = ['match_request', 'match_accepted', 'match_rejected'];
        if (matchTypes.includes(this.type)) {
          return value != null;
        }
        return true;
      },
      message: 'matchId is required for match notifications'
    }
  },
  
  chatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Chat",
    // ✅ Required for message notifications
    validate: {
      validator: function(value) {
        if (this.type === 'new_message') {
          return value != null;
        }
        return true;
      },
      message: 'chatId is required for message notifications'
    }
  },
  
  message: { 
    type: String,
    trim: true,
    maxlength: [500, 'Message preview cannot exceed 500 characters']
  },
  
  read: { 
    type: Boolean, 
    default: false,
    index: true // ✅ Index for filtering unread
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    immutable: true // ✅ Prevent modification
  },
  
  expiresAt: { 
    type: Date, 
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    index: true // ✅ Required for TTL to work
  }
}, {
  // ✅ Schema options
  timestamps: false // Using custom createdAt
});

// ✅ INDEXES - Critical for performance

// 1. Main query: Get user's notifications sorted by date
NotificationSchema.index({ recipient: 1, createdAt: -1 });

// 2. Type filtering: Get specific notification types
NotificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });

// 3. Unread count: Fast unread counting
NotificationSchema.index({ recipient: 1, read: 1 });

// 4. TTL Index: Auto-delete after expiry
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// 5. Match cleanup: Find notifications by matchId
NotificationSchema.index({ matchId: 1 });

// 6. Chat cleanup: Find notifications by chatId (optional, for future use)
NotificationSchema.index({ chatId: 1 });

// ✅ INSTANCE METHODS

/**
 * Mark notification as read
 */
NotificationSchema.methods.markAsRead = async function() {
  this.read = true;
  return this.save();
};

/**
 * Check if notification is expired
 */
NotificationSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

// ✅ STATIC METHODS

/**
 * Get unread count for a user
 */
NotificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId, read: false });
};

/**
 * Mark all as read for a user
 */
NotificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { recipient: userId, read: false },
    { read: true }
  );
};

/**
 * Delete all message notifications for a user
 */
NotificationSchema.statics.deleteAllMessages = async function(userId) {
  return this.deleteMany({
    recipient: userId,
    type: "new_message"
  });
};

/**
 * Delete notifications by matchId
 */
NotificationSchema.statics.deleteByMatch = async function(matchId) {
  return this.deleteMany({ matchId });
};

// ✅ MIDDLEWARE - Pre-save validation

NotificationSchema.pre('save', function(next) {
  // Validate matchId for match notifications
  const matchTypes = ['match_request', 'match_accepted', 'match_rejected'];
  if (matchTypes.includes(this.type) && !this.matchId) {
    return next(new Error(`matchId is required for ${this.type} notifications`));
  }
  
  // Validate chatId for message notifications
  if (this.type === 'new_message' && !this.chatId) {
    return next(new Error('chatId is required for new_message notifications'));
  }
  
  next();
});

// ✅ LOGGING (optional - for debugging)
NotificationSchema.post('save', function(doc) {
  console.log(`📬 Notification created: ${doc.type} for user ${doc.recipient}`);
});

NotificationSchema.post('deleteOne', { document: true, query: false }, function(doc) {
  console.log(`🗑️ Notification deleted: ${doc._id}`);
});

export default mongoose.model("Notification", NotificationSchema);