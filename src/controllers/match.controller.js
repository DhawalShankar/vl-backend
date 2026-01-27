import Match from "../models/Match.js";
import User from "../models/User.js";
import Chat from "../models/Chat.js";
import Notification from "../models/Notification.js";
import { getIO } from "../socket.js";

export const getPotentialMatches = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find users who:
    // 1. Want to learn what the current user knows
    // 2. Know what the current user wants to learn
    // 3. Are in the same state
    // 4. Haven't been matched with already (pending/accepted/rejected)

    // Get all existing match user IDs
    const existingMatches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }]
    });
    
    const matchedUserIds = existingMatches.map(match => 
      match.user1.toString() === userId ? match.user2.toString() : match.user1.toString()
    );

    const languagesIKnow = user.languagesKnow.map(l => l.language);
    const languageIWantToLearn = user.primaryLanguageToLearn;

    const potentialMatches = await User.find({
      _id: { $ne: userId, $nin: matchedUserIds },
      state: user.state,
      primaryLanguageToLearn: { $in: languagesIKnow },
      "languagesKnow.language": languageIWantToLearn
    }).select("-password").limit(20);

    res.json({ matches: potentialMatches });
  } catch (error) {
    console.error("Get potential matches error:", error);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
};

export const handleSwipe = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { targetUserId, action } = req.body; // action: "like" or "skip"

    if (action !== "like" && action !== "skip") {
      return res.status(400).json({ error: "Invalid action" });
    }

    // Check if match already exists
    const existingMatch = await Match.findOne({
      $or: [
        { user1: userId, user2: targetUserId },
        { user1: targetUserId, user2: userId }
      ]
    });

    if (existingMatch) {
      return res.status(400).json({ error: "Match already exists" });
    }

    if (action === "like") {
      // Create match request
      const match = await Match.create({
        user1: userId,
        user2: targetUserId,
        status: "pending"
      });

      // Create notification for target user
      const notification = await Notification.create({
        recipient: targetUserId,
        sender: userId,
        type: "match_request",
        matchId: match._id
      });

      // Populate notification before sending
      await notification.populate('sender', 'name languagesKnow');

      // Notify via Socket.IO
      try {
        const io = getIO();
        io.emit("new_notification", {
          userId: targetUserId,
          notification: {
            _id: notification._id,
            type: notification.type,
            sender: notification.sender,
            matchId: match._id,
            createdAt: notification.createdAt
          }
        });
      } catch (socketError) {
        console.log("Socket.io not available for notification");
      }

      return res.json({ message: "Match request sent", match });
    }

    // For skip, just log it (optional)
    res.json({ message: "Skipped" });
  } catch (error) {
    console.error("Handle swipe error:", error);
    res.status(500).json({ error: "Failed to process swipe" });
  }
};

export const getMyMatches = async (req, res) => {
  try {
    const userId = req.user.userId;

    const matches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }]
    })
    .populate('user1', '-password')
    .populate('user2', '-password')
    .sort({ createdAt: -1 });

    // Format matches to show the other user
    const formattedMatches = matches.map(match => {
      const otherUser = match.user1._id.toString() === userId 
        ? match.user2 
        : match.user1;
      
      return {
        id: match._id,
        user: otherUser,
        status: match.status,
        createdAt: match.createdAt,
        isSender: match.user1._id.toString() === userId
      };
    });

    res.json({ matches: formattedMatches });
  } catch (error) {
    console.error("Get my matches error:", error);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
};

export const acceptMatch = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { matchId } = req.params;

    const match = await Match.findOne({
      _id: matchId,
      user2: userId,
      status: "pending"
    });

    if (!match) {
      return res.status(404).json({ error: "Match request not found" });
    }

    // Update match status
    match.status = "accepted";
    await match.save();

    // Create or find existing chat
    let chat = await Chat.findOne({
      participants: { $all: [match.user1, match.user2] }
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [match.user1, match.user2],
        messages: []
      });
    }

    // ✅ Delete the match_request notification for recipient
    await Notification.deleteMany({
      recipient: userId,
      matchId: match._id,
      type: "match_request"
    });

    // ✅ Create acceptance notification for sender
    const notification = await Notification.create({
      recipient: match.user1,
      sender: userId,
      type: "match_accepted",
      matchId: match._id
    });

    await notification.populate('sender', 'name languagesKnow');

    // Notify via Socket.IO
    try {
      const io = getIO();
      
      // Notify sender that match was accepted
      io.emit("match_accepted", {
        userId: match.user1.toString(),
        notification: {
          _id: notification._id,
          type: notification.type,
          sender: notification.sender,
          matchId: match._id,
          createdAt: notification.createdAt
        }
      });

      // Also emit to both users for real-time UI update
      io.emit("new_notification", {
        userId: match.user1.toString(),
        notification
      });
    } catch (socketError) {
      console.log("Socket.io not available for match acceptance");
    }

    res.json({ 
      message: "Match accepted", 
      chatId: chat._id,
      match 
    });
  } catch (error) {
    console.error("Accept match error:", error);
    res.status(500).json({ error: "Failed to accept match" });
  }
};

export const rejectMatch = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { matchId } = req.params;

    const match = await Match.findOne({
      _id: matchId,
      user2: userId,
      status: "pending"
    });

    if (!match) {
      return res.status(404).json({ error: "Match request not found" });
    }

    // Update match status
    match.status = "rejected";
    await match.save();

    // ✅ Delete the match_request notification
    await Notification.deleteMany({
      recipient: userId,
      matchId: match._id,
      type: "match_request"
    });

    // Optionally notify sender (if you want)
    // For now, just silently reject

    res.json({ message: "Match rejected" });
  } catch (error) {
    console.error("Reject match error:", error);
    res.status(500).json({ error: "Failed to reject match" });
  }
};