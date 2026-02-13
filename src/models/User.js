import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },

   // ⬇️ NAYE FIELDS
  googleId: { type: String, sparse: true, unique: true },
  authProvider: { type: String, enum: ["local", "google"], default: "local" },
    //
  primaryLanguageToLearn: { type: String, required: true },
  secondaryLanguageToLearn: String,
  languagesKnow: [
    {
      language: { type: String, required: true },
      fluency: { type: String, required: true }
    }
  ],
  primaryRole: { type: String, enum: ["learner", "teacher"], default: "learner" },
  state: { type: String, required: true },
  country: { type: String, default: "India" },
  emailUpdates: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  bio: String,
  city: String,
  profilePhoto: String,
  totalConnections: { type: Number, default: 0 },
  coursesCompleted: { type: Number, default: 0 },
  hoursLearned: { type: Number, default: 0 }
});

export default mongoose.model("User", UserSchema);