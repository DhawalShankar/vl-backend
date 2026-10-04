// Match.js
import mongoose from "mongoose";

const MatchSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { 
    type: String, 
    enum: ["pending", "accepted", "rejected"],
    default: "pending" 
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(+new Date() + 7*24*60*60*1000) } // 7 days expiry
});

// Prevents duplicate matches
MatchSchema.index({ user1: 1, user2: 1 }, { unique: true });

// Auto-delete expired PENDING and REJECTED matches only (accepted stay forever)
MatchSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: { $in: ["pending", "rejected"] } }
  }
);

export default mongoose.model("Match", MatchSchema);