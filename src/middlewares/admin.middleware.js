// src/middlewares/admin.middleware.js
import User from '../models/User.js';

export const adminOnly = async (req, res, next) => {
  try {
    // Check authentication
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ 
        success: false, 
        error: "Authentication required" 
      });
    }

    // Fetch user and check email
    const user = await User.findById(req.user.userId).select('email');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "User not found" 
      });
    }

    // Only vartalang@gmail.com has admin access
    if (user.email.toLowerCase() !== 'vartalang@gmail.com') {
      return res.status(403).json({ 
        success: false, 
        error: "Access denied. Admin only." 
      });
    }

    // User is admin - proceed
    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Server error" 
    });
  }
};