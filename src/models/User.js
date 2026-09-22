// User.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  

   // ⬇️ NAYE FIELDS
  googleId: { type: String, sparse: true, unique: true },
  authProvider: { type: String, enum: ["local", "google"], default: "local" },
  // Password field ko conditional required banana hai
  password: { 
    type: String, 
    required: function() {
      return this.authProvider === 'local';
    }
  },
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
  hoursLearned: { type: Number, default: 0 },

  // ✅ NEW: opt-in chat translation plugin — pure on/off.
  // The target language is derived automatically from languagesKnow
  // (see chat.controller.js), so no language field is stored here.
  translationPreference: {
    enabled: { type: Boolean, default: false }
  }
});

export default mongoose.model("User", UserSchema);