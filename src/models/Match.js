import mongoose from "mongoose";

const MatchSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { 
    type: String, 
    enum: ["pending", "accepted", "rejected"], // ✅ FIXED: Changed "matched" to "accepted"
    default: "pending" 
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(+new Date() + 7*24*60*60*1000) } // 7 days expiry
});

// ✅ FIXED: Allow both directions of the same match
// This index prevents duplicate matches in BOTH directions
MatchSchema.index({ user1: 1, user2: 1 }, { unique: true });

// Auto-delete expired pending matches
MatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Match", MatchSchema);