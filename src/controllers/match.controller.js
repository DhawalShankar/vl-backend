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

    // ✅ FIXED: Only exclude users with ACCEPTED matches, not all matches
    const acceptedMatches = await Match.find({
      $or: [
        { user1: userId, status: "accepted" },
        { user2: userId, status: "accepted" }
      ]
    });
    
    const matchedUserIds = acceptedMatches.map(match => 
      match.user1.toString() === userId ? match.user2.toString() : match.user1.toString()
    );

    // ✅ ALSO exclude users you've already swiped on (pending or rejected)
    const existingSwipes = await Match.find({
      user1: userId // Only check matches YOU initiated
    });
    
    const swipedUserIds = existingSwipes.map(match => match.user2.toString());

    const languagesIKnow = user.languagesKnow.map(l => l.language);
    const languageIWantToLearn = user.primaryLanguageToLearn;

    // ✅ FIXED: Better matching logic
    const potentialMatches = await User.find({
      _id: { 
        $ne: userId, 
        $nin: [...matchedUserIds, ...swipedUserIds] // Exclude both matched AND already swiped
      },
      state: user.state,
      // They want to learn what you know
      primaryLanguageToLearn: { $in: languagesIKnow },
      // They know what you want to learn
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
    const { targetUserId, action } = req.body; // action: "like" or "skip"

    console.log(`👆 User ${userId} swiped ${action} on ${targetUserId}`);

    if (action !== "like" && action !== "skip") {
      return res.status(400).json({ error: "Invalid action" });
    }

    // ✅ Check if you already swiped on this user
    const existingMatch = await Match.findOne({
      user1: userId, 
      user2: targetUserId
    });

    if (existingMatch) {
      return res.status(400).json({ error: "You already swiped on this user" });
    }

    if (action === "skip") {
      // ✅ For skip, create a rejected match so they don't show up again
      await Match.create({
        user1: userId,
        user2: targetUserId,
        status: "rejected"
      });
      
      console.log(`⏭️ User ${userId} skipped ${targetUserId}`);
      return res.json({ message: "Skipped" });
    }

    // ✅ For "like", check if the other person already liked you
    const reverseMatch = await Match.findOne({
      user1: targetUserId,
      user2: userId,
      status: "pending"
    });

    if (reverseMatch) {
      // ✅ MUTUAL MATCH! Both users liked each other
      console.log(`🎉 MUTUAL MATCH! User ${userId} and ${targetUserId} matched!`);

      // Update the existing match to accepted
      reverseMatch.status = "accepted";
      await reverseMatch.save();

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

      // ✅ Create notifications for BOTH users
      const [user, targetUser] = await Promise.all([
        User.findById(userId),
        User.findById(targetUserId)
      ]);

      // Notify User A (current user)
      const notificationForA = await Notification.create({
        recipient: userId,
        sender: targetUserId,
        type: "match_accepted",
        matchId: reverseMatch._id
      });

      // Notify User B (target user)
      const notificationForB = await Notification.create({
        recipient: targetUserId,
        sender: userId,
        type: "match_accepted",
        matchId: reverseMatch._id
      });

      await notificationForA.populate('sender', 'name languagesKnow');
      await notificationForB.populate('sender', 'name languagesKnow');

      // Emit Socket.IO events to both users
      try {
        const io = getIO();
        
        // Notify User A
        io.emit("match_accepted", {
          userId: userId,
          notification: {
            _id: notificationForA._id,
            type: notificationForA.type,
            sender: notificationForA.sender,
            matchId: reverseMatch._id,
            createdAt: notificationForA.createdAt
          }
        });

        // Notify User B
        io.emit("match_accepted", {
          userId: targetUserId,
          notification: {
            _id: notificationForB._id,
            type: notificationForB.type,
            sender: notificationForB.sender,
            matchId: reverseMatch._id,
            createdAt: notificationForB.createdAt
          }
        });

        io.emit("new_notification", { userId: userId, notification: notificationForA });
        io.emit("new_notification", { userId: targetUserId, notification: notificationForB });
      } catch (socketError) {
        console.log("Socket.io not available for match notification");
      }

      return res.json({ 
        message: "It's a match!",
        matched: true,
        chatId: chat._id,
        match: reverseMatch
      });
    }

    // ✅ No reverse match exists, create pending match
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

      io.emit("new_notification", {
        userId: match.user1.toString(),
        notification
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

    // ✅ Delete the match_request notification
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