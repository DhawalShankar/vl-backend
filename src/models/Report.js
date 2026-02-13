// src/models/Report.js
import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  reportedUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  chatId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Chat', 
    required: true 
  },
  reason: { 
    type: String, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true 
});

// Index for faster queries
reportSchema.index({ timestamp: -1 });
reportSchema.index({ reportedUser: 1 });

export default mongoose.model('Report', reportSchema);