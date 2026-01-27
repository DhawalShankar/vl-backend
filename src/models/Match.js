import mongoose from "mongoose";

const MatchSchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { 
    type: String, 
    enum: ["pending", "matched", "rejected"], 
    default: "pending" 
  },
  initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now }
});

// Ensure unique match pairs
MatchSchema.index({ user1: 1, user2: 1 }, { unique: true });

export default mongoose.model("Match", MatchSchema);