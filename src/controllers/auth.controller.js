import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from 'google-auth-library'; // ← NAYA IMPORT
export const signup = async (req, res) => {
  try {
    const { email, password, name, primaryLanguageToLearn, languagesKnow, state } = req.body;

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
      ...req.body,
      email: email.toLowerCase(),
      password: hashed,
    });

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ 
      message: "Signup successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ 
      token,
      userId: user._id.toString(),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        primaryRole: user.primaryRole
      }
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
    const updates = req.body;

    // Don't allow password or email updates through this endpoint
    delete updates.password;
    delete updates.email;

    // Validate required fields if they're being updated
    if (updates.languagesKnow && updates.languagesKnow.length === 0) {
      return res.status(400).json({ error: "At least one language is required" });
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ 
      message: "Profile updated successfully",
      user 
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};


// ⬇️⬇️⬇️ NAYE GOOGLE FUNCTIONS ⬇️⬇️⬇️

export const googleSignup = async (req, res) => {
  try {
    const { googleToken } = req.body;

    // Google token verify
    const ticket = await client.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId, picture } = payload;

    // Check if already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        error: "Email already registered. Please login instead." 
      });
    }

    // Create new user (WITHOUT password)
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      googleId,
      profilePhoto: picture,
      authProvider: 'google',
      // Temporary values - user will fill these in onboarding
      primaryLanguageToLearn: 'English',
      languagesKnow: [{ language: 'English', fluency: 'Beginner' }],
      state: 'Delhi',
      country: 'India'
    });

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({ 
      message: "Google signup successful",
      token,
      userId: user._id.toString(),
      needsOnboarding: true // Flag to redirect to onboarding
    });

  } catch (error) {
    console.error("Google signup error:", error);
    res.status(500).json({ error: "Google authentication failed" });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { googleToken } = req.body;

    // Google token verify
    const ticket = await client.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email } = payload;

    // Find user
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      authProvider: 'google' 
    });

    if (!user) {
      return res.status(404).json({ 
        error: "Account not found. Please sign up first." 
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({ 
      token,
      userId: user._id.toString(),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        primaryRole: user.primaryRole
      }
    });

  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ error: "Google authentication failed" });
  }
};