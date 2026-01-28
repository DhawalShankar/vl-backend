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

    // ✅ FIXED: Exclude users with accepted matches in BOTH directions
    const acceptedMatches = await Match.find({
      $or: [
        { user1: userId, status: "accepted" },
        { user2: userId, status: "accepted" }
      ]
    });
    
    const matchedUserIds = acceptedMatches.map(match => 
      match.user1.toString() === userId ? match.user2.toString() : match.user1.toString()
    );

    // ✅ FIXED: Exclude users you've interacted with in ANY direction
    const existingInteractions = await Match.find({
      $or: [
        { user1: userId }, // You swiped on them
        { user2: userId }  // They swiped on you
      ]
    });
    
    const interactedUserIds = existingInteractions.map(match => {
      return match.user1.toString() === userId 
        ? match.user2.toString() 
        : match.user1.toString();
    });

    const languagesIKnow = user.languagesKnow.map(l => l.language);
    const languageIWantToLearn = user.primaryLanguageToLearn;

    // Find potential matches
    const potentialMatches = await User.find({
      _id: { 
        $ne: userId, 
        $nin: [...matchedUserIds, ...interactedUserIds] // Exclude all previous interactions
      },
      state: user.state,
      primaryLanguageToLearn: { $in: languagesIKnow },
      "languagesKnow.language": languageIWantToLearn
    }).select("-password").limit(20);

    console.log(`📋 Found ${potentialMatches.length} potential matches for user ${userId}`);
    console.log(`🔍 User wants to learn: ${languageIWantToLearn}`);
    console.log(`🔍 User knows: ${languagesIKnow.join(', ')}`);

    res.json({ matches: potentialMatches });
  } catch (error) {
    console.error("Get potential matches error:", error);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
};

export const handleSwipe = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { targetUserId, action } = req.body;

    console.log(`👆 User ${userId} swiped ${action} on ${targetUserId}`);

    if (action !== "like" && action !== "skip") {
      return res.status(400).json({ error: "Invalid action" });
    }

    // ✅ FIXED: Check if match exists in EITHER direction
    const existingMatch = await Match.findOne({
      $or: [
        { user1: userId, user2: targetUserId },
        { user1: targetUserId, user2: userId }
      ]
    });

    if (existingMatch) {
      // ✅ FIXED: Handle mutual match case
      if (existingMatch.status === 'pending' && action === 'like') {
        // This is a MUTUAL MATCH!
        const iAmUser1 = existingMatch.user1.toString() === userId;
        
        console.log(`🎉 MUTUAL MATCH! User ${userId} and ${targetUserId} matched!`);

        // Update status to accepted
        existingMatch.status = "accepted";
        await existingMatch.save();

        // Create or find existing chat
        let chat = await Chat.findOne({
          participants: { $all: [userId, targetUserId] }
        });

        if (!chat) {
          chat = await Chat.create({
            participants: [userId, targetUserId],
            messages: []
          });
        }

        // ✅ Delete any pending match_request notifications
        await Notification.deleteMany({
          matchId: existingMatch._id,
          type: "match_request"
        });

        // ✅ Create notifications for BOTH users
        const [notificationForCurrentUser, notificationForTargetUser] = await Promise.all([
          Notification.create({
            recipient: userId,
            sender: targetUserId,
            type: "match_accepted",
            matchId: existingMatch._id
          }),
          Notification.create({
            recipient: targetUserId,
            sender: userId,
            type: "match_accepted",
            matchId: existingMatch._id
          })
        ]);

        await Promise.all([
          notificationForCurrentUser.populate('sender', 'name languagesKnow'),
          notificationForTargetUser.populate('sender', 'name languagesKnow')
        ]);

        // ✅ FIXED: Emit Socket.IO events to specific users
        try {
          const io = getIO();
          
          // Notify current user
          io.to(`user_${userId}`).emit("match_accepted", {
            userId: userId,
            notification: {
              _id: notificationForCurrentUser._id,
              type: notificationForCurrentUser.type,
              sender: notificationForCurrentUser.sender,
              matchId: existingMatch._id,
              createdAt: notificationForCurrentUser.createdAt
            }
          });

          // Notify target user
          io.to(`user_${targetUserId}`).emit("match_accepted", {
            userId: targetUserId,
            notification: {
              _id: notificationForTargetUser._id,
              type: notificationForTargetUser.type,
              sender: notificationForTargetUser.sender,
              matchId: existingMatch._id,
              createdAt: notificationForTargetUser.createdAt
            }
          });

          io.to(`user_${userId}`).emit("new_notification", { 
            userId: userId, 
            notification: notificationForCurrentUser 
          });
          io.to(`user_${targetUserId}`).emit("new_notification", { 
            userId: targetUserId, 
            notification: notificationForTargetUser 
          });
        } catch (socketError) {
          console.log("Socket.io not available for match notification");
        }

        return res.json({ 
          message: "It's a match!",
          matched: true,
          chatId: chat._id,
          match: existingMatch
        });
      } else {
        // Already interacted with this user
        return res.status(400).json({ error: "You already interacted with this user" });
      }
    }

    // No existing match in either direction

    if (action === "skip") {
      // Create a rejected match
      await Match.create({
        user1: userId,
        user2: targetUserId,
        status: "rejected"
      });
      
      console.log(`⏭️ User ${userId} skipped ${targetUserId}`);
      return res.json({ message: "Skipped" });
    }

    // Action is "like" - create pending match
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

    await notification.populate('sender', 'name languagesKnow');

    // ✅ FIXED: Notify specific user via Socket.IO
    try {
      const io = getIO();
      io.to(`user_${targetUserId}`).emit("new_notification", {
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

    console.log(`💌 Match request sent from ${userId} to ${targetUserId}`);
    return res.json({ 
      message: "Match request sent", 
      matched: false,
      match 
    });
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

    // Delete the match_request notification for recipient
    await Notification.deleteMany({
      recipient: userId,
      matchId: match._id,
      type: "match_request"
    });

    // Create notifications for BOTH users
    const [notificationForAcceptor, notificationForSender] = await Promise.all([
      Notification.create({
        recipient: userId,
        sender: match.user1,
        type: "match_accepted",
        matchId: match._id
      }),
      Notification.create({
        recipient: match.user1,
        sender: userId,
        type: "match_accepted",
        matchId: match._id
      })
    ]);

    await Promise.all([
      notificationForAcceptor.populate('sender', 'name languagesKnow'),
      notificationForSender.populate('sender', 'name languagesKnow')
    ]);

    // ✅ FIXED: Notify specific users via Socket.IO
    try {
      const io = getIO();
      
      // Notify both users
      io.to(`user_${userId}`).emit("match_accepted", {
        userId: userId,
        notification: {
          _id: notificationForAcceptor._id,
          type: notificationForAcceptor.type,
          sender: notificationForAcceptor.sender,
          matchId: match._id,
          createdAt: notificationForAcceptor.createdAt
        }
      });

      io.to(`user_${match.user1.toString()}`).emit("match_accepted", {
        userId: match.user1.toString(),
        notification: {
          _id: notificationForSender._id,
          type: notificationForSender.type,
          sender: notificationForSender.sender,
          matchId: match._id,
          createdAt: notificationForSender.createdAt
        }
      });

      io.to(`user_${userId}`).emit("new_notification", {
        userId: userId,
        notification: notificationForAcceptor
      });

      io.to(`user_${match.user1.toString()}`).emit("new_notification", {
        userId: match.user1.toString(),
        notification: notificationForSender
      });
    } catch (socketError) {
      console.log("Socket.io not available for match acceptance");
    }

    console.log(`✅ User ${userId} accepted match request from ${match.user1}`);

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

    // Delete the match_request notification
    await Notification.deleteMany({
      recipient: userId,
      matchId: match._id,
      type: "match_request"
    });

    console.log(`❌ User ${userId} rejected match request from ${match.user1}`);

    res.json({ message: "Match rejected" });
  } catch (error) {
    console.error("Reject match error:", error);
    res.status(500).json({ error: "Failed to reject match" });
  }
};