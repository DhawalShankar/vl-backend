const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,

  primaryLanguageToLearn: String,
  secondaryLanguageToLearn: String,
  languagesKnow: [{ language: String, fluency: String }],
  primaryRole: String,

  state: String,
  country: String,
  emailUpdates: Boolean,

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);
