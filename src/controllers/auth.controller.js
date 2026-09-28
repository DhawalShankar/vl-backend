import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ---------- helpers ----------
const signToken = (userId, expiresIn = "7d") =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn });

// ---------- LOCAL SIGNUP ----------
export const signup = async (req, res) => {
  try {
    // Only take the fields we allow (no more ...req.body spread)
    const {
      email,
      password,
      name,
      primaryLanguageToLearn,
      secondaryLanguageToLearn,
      languagesKnow,
      primaryRole,
      state,
      country,
      city,
      bio,
      emailUpdates,
    } = req.body;

    // Validation
    if (!email || !password || !name || !primaryLanguageToLearn || !state) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    if (!languagesKnow || languagesKnow.length === 0) {
      return res.status(400).json({ error: "Please add at least one language you know" });
    }

    // Check if user already exists
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      authProvider: "local",
      primaryLanguageToLearn,
      secondaryLanguageToLearn,
      languagesKnow,
      primaryRole: primaryRole || "learner",
      state,
      country: country || "India",
      city,
      bio,
      emailUpdates: emailUpdates !== undefined ? emailUpdates : true,
    });

    const token = signToken(user._id, "7d");

    res.status(201).json({
      message: "Signup successful",
      token,
      userId: user._id.toString(), // added: frontend reads data.userId
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
};

// ---------- EMAIL + PASSWORD LOGIN ----------
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // FIX: no authProvider filter. Anyone who has a password set
    // (local user OR Google user who added an optional password) can log in.
    const user = await User.findOne({ email: email.toLowerCase() });

    // Same generic message for "no such user" and "no password set (Google-only)"
    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(user._id, "7d");

    res.json({
      token,
      userId: user._id.toString(),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        primaryRole: user.primaryRole,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("GetMe error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const updates = { ...req.body };

    // Don't allow sensitive fields to be changed through this endpoint
    delete updates.password;
    delete updates.email;
    delete updates.googleId;
    delete updates.authProvider;

    // Validate required fields if they're being updated
    if (updates.languagesKnow && updates.languagesKnow.length === 0) {
      return res.status(400).json({ error: "At least one language is required" });
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

// ---------- GOOGLE SIGNUP ----------
export const googleSignup = async (req, res) => {
  try {
    const {
      googleAccessToken,
      name,
      email,
      password, // optional
      primaryLanguageToLearn,
      secondaryLanguageToLearn,
      languagesKnow,
      primaryRole,
      state,
      country,
      emailUpdates,
    } = req.body;

    // Validate
    if (!googleAccessToken || !name || !email || !primaryLanguageToLearn || !languagesKnow || !state) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (languagesKnow.length === 0) {
      return res.status(400).json({ error: "Please add at least one language you know" });
    }

    // FIX: if a password is given, it must be valid (no more silent ignore)
    if (password && password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Verify Google token via userinfo endpoint
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!userInfoResponse.ok) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const googleUserInfo = await userInfoResponse.json();

    // Verify email matches
    if (googleUserInfo.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ error: "Email mismatch" });
    }

    // Check if exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        error: "Email already registered. Please login instead.",
      });
    }

    // Prepare user data
    const userData = {
      name,
      email: email.toLowerCase(),
      googleId: googleUserInfo.sub,
      authProvider: "google",
      profilePhoto: googleUserInfo.picture,
      primaryLanguageToLearn,
      secondaryLanguageToLearn,
      languagesKnow,
      primaryRole: primaryRole || "learner",
      state,
      country: country || "India",
      emailUpdates: emailUpdates !== undefined ? emailUpdates : true,
    };

    // Optional password (lets the user also log in with email + password)
    if (password) {
      userData.password = await bcrypt.hash(password, 10);
    }

    const user = await User.create(userData);

    const token = signToken(user._id, "30d");

    res.status(201).json({
      message: "Google signup successful",
      token,
      userId: user._id.toString(),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Google signup error:", error);
    res.status(500).json({ error: "Google authentication failed" });
  }
};

// ---------- GOOGLE LOGIN ----------
export const googleLogin = async (req, res) => {
  try {
    const { googleAccessToken } = req.body;

    if (!googleAccessToken) {
      return res.status(400).json({ error: "Google access token is required" });
    }

    // Verify Google token
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!userInfoResponse.ok) {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const googleUserInfo = await userInfoResponse.json();

    // FIX: no authProvider filter, lookup by email only
    const user = await User.findOne({ email: googleUserInfo.email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        error: "Account not found. Please sign up first.",
      });
    }

    // Link Google ID if this account doesn't have one yet
    if (!user.googleId && googleUserInfo.sub) {
      user.googleId = googleUserInfo.sub;
      await user.save();
    }

    const token = signToken(user._id, "30d");

    res.json({
      token,
      userId: user._id.toString(),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        primaryRole: user.primaryRole,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ error: "Google authentication failed" });
  }
};

// ---------- GET USER BY ID ----------
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate ObjectId
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({ error: "Server error" });
  }
};