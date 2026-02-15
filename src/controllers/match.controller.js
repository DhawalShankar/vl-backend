import Match from "../models/Match.js";
import User from "../models/User.js";
import Chat from "../models/Chat.js";
import Notification from "../models/Notification.js";

export const getPotentialMatches = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Exclude users with accepted matches in BOTH directions
    const acceptedMatches = await Match.find({
      $or: [
        { user1: userId, status: "accepted" },
        { user2: userId, status: "accepted" }
      ]
    });
    
    const matchedUserIds = acceptedMatches.map(match => 
      match.user1.toString() === userId ? match.user2.toString() : match.user1.toString()
    );

    // Exclude users you've interacted with in ANY direction
    const existingInteractions = await Match.find({
      $or: [
        { user1: userId },
        { user2: userId }
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
        $nin: [...matchedUserIds, ...interactedUserIds]
      },
      primaryLanguageToLearn: { $in: languagesIKnow },
      "languagesKnow.language": languageIWantToLearn
    }).select("-password").limit(20);

    console.log(`📋 Found ${potentialMatches.length} potential matches for user ${userId}`);

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

    // Check if match exists in EITHER direction
    const existingMatch = await Match.findOne({
      $or: [
        { user1: userId, user2: targetUserId },
        { user1: targetUserId, user2: userId }
      ]
    });

    if (existingMatch) {
      // Check WHO created the existing match
      const iAmUser1 = existingMatch.user1.toString() === userId;
      
      // If I'm user1, I already swiped - don't allow double swipe
      if (iAmUser1) {
        return res.status(400).json({ error: "You already swiped on this user" });
      }
      
      // Handle mutual match case (only if I'm user2)
      if (existingMatch.status === 'pending' && action === 'like') {
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

        // Delete any pending match_request notifications
        await Notification.deleteMany({
          matchId: existingMatch._id,
          type: "match_request"
        });

        // Create notifications for BOTH users
        await Notification.create({
          recipient: userId,
          sender: targetUserId,
          type: "match_accepted",
          matchId: existingMatch._id
        });

        await Notification.create({
          recipient: targetUserId,
          sender: userId,
          type: "match_accepted",
          matchId: existingMatch._id
        });

        console.log(`✅ Match accepted notifications created for both users`);

        return res.json({ 
          message: "It's a match!",
          matched: true,
          chatId: chat._id,
          match: existingMatch
        });
      } else {
        return res.status(400).json({ error: "You already interacted with this user" });
      }
    }

    // No existing match in either direction

    if (action === "skip") {
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

    console.log(`✅ Match created: ${match._id}`);

    // Create notification
    const notification = await Notification.create({
      recipient: targetUserId,
      sender: userId,
      type: "match_request",
      matchId: match._id
    });

    console.log(`✅ Notification created: ${notification._id}`);
    console.log(`🙏Match request sent from ${userId} to ${targetUserId}`);
    
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

    // Validate matchId format
    if (!matchId || matchId === 'undefined' || matchId === 'null') {
      return res.status(400).json({ error: "Invalid match ID" });
    }

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
    await Notification.create({
      recipient: userId,
      sender: match.user1,
      type: "match_accepted",
      matchId: match._id
    });

    await Notification.create({
      recipient: match.user1,
      sender: userId,
      type: "match_accepted",
      matchId: match._id
    });

    console.log(`✅ User ${userId} accepted match request from ${match.user1}`);
    console.log(`✅ Match accepted notifications created for both users`);

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

    // Validate matchId format
    if (!matchId || matchId === 'undefined' || matchId === 'null') {
      return res.status(400).json({ error: "Invalid match ID" });
    }

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