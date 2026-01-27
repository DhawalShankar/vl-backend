import User from "../models/User.js";
import Match from "../models/Match.js";
import Chat from "../models/Chat.js";
import Notification from "../models/Notification.js";
import { emitToUser } from "../socket.js";

export const getPotentialMatches = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get users the current user has already swiped on
    const existingMatches = await Match.find({
      $or: [
        { user1: userId },
        { user2: userId }
      ]
    }).select('user1 user2');

    const excludedUserIds = existingMatches.flatMap(match => 
      [match.user1.toString(), match.user2.toString()]
    ).filter(id => id !== userId.toString());

    // Find potential matches
    const myKnownLanguages = user.languagesKnow.map(l => l.language);
    const myPrimaryLearning = user.primaryLanguageToLearn;
    const mySecondaryLearning = user.secondaryLanguageToLearn;

    // Primary matches: Users who want to learn what I know AND know what I want to learn
    const primaryMatches = await User.find({
      _id: { $nin: [...excludedUserIds, userId] },
      $or: [
        { primaryLanguageToLearn: { $in: myKnownLanguages } },
        { secondaryLanguageToLearn: { $in: myKnownLanguages } }
      ],
      'languagesKnow.language': myPrimaryLearning
    }).select('-password').limit(10);

    // Secondary matches: Users who know what I want to learn (even if not perfect match)
    const secondaryMatches = await User.find({
      _id: { 
        $nin: [
          ...excludedUserIds, 
          userId,
          ...primaryMatches.map(u => u._id)
        ] 
      },
      'languagesKnow.language': { $in: [myPrimaryLearning, mySecondaryLearning].filter(Boolean) }
    }).select('-password').limit(5);

    // Combine and format matches
    const allMatches = [
      ...primaryMatches.map(u => ({ ...u.toObject(), matchType: 'primary' })),
      ...secondaryMatches.map(u => ({ ...u.toObject(), matchType: 'secondary' }))
    ];

    res.json({ matches: allMatches });
  } catch (error) {
    console.error("Get matches error:", error);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
};

export const handleSwipe = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { targetUserId, action } = req.body; // action: 'like' or 'pass'

    if (!targetUserId || !action) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create match record
    const [smallerId, largerId] = [userId, targetUserId].sort();
    
    const match = await Match.create({
      user1: smallerId,
      user2: largerId,
      status: action === 'like' ? 'pending' : 'rejected',
      initiatedBy: userId
    });

    // If it's a like, create notification for target user
    if (action === 'like') {
      const sender = await User.findById(userId).select('name languagesKnow primaryLanguageToLearn');
      
      const notification = await Notification.create({
        recipient: targetUserId,
        sender: userId,
        type: 'match_request',
        matchId: match._id
      });

      // Emit notification via Socket.IO (optional - for real-time notification bell)
      emitToUser(targetUserId, 'new_notification', {
        notification: {
          ...notification.toObject(),
          sender: sender
        }
      });

      return res.json({ 
        message: "Match request sent!", 
        matched: false,
        status: 'pending'
      });
    }

    res.json({ message: "Passed", matched: false });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Already swiped on this user" });
    }
    console.error("Swipe error:", error);
    res.status(500).json({ error: "Failed to process swipe" });
  }
};

export const getMyMatches = async (req, res) => {
  try {
    const userId = req.user.userId;

    const matches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }],
      status: 'matched'
    })
    .populate('user1', '-password')
    .populate('user2', '-password');

    const matchedUsers = matches.map(match => {
      const otherUser = match.user1._id.toString() === userId ? match.user2 : match.user1;
      return otherUser;
    });

    res.json({ matches: matchedUsers });
  } catch (error) {
    console.error("Get my matches error:", error);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
};

export const acceptMatch = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { matchId } = req.params;

    const match = await Match.findById(matchId);

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Check if user is part of this match
    if (match.user1.toString() !== userId && match.user2.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check if user is the one who received the request
    if (match.initiatedBy.toString() === userId) {
      return res.status(400).json({ error: "Cannot accept your own match request" });
    }

    // Update match status
    match.status = 'matched';
    match.acceptedBy = userId;
    await match.save();

    // Create chat between users
    const existingChat = await Chat.findOne({
      participants: { $all: [match.user1, match.user2] }
    });

    let chatId;
    if (!existingChat) {
      const newChat = await Chat.create({
        participants: [match.user1, match.user2],
        messages: []
      });
      chatId = newChat._id;
    } else {
      chatId = existingChat._id;
    }

    // Create notification for the initiator
    await Notification.create({
      recipient: match.initiatedBy,
      sender: userId,
      type: 'match_accepted',
      matchId: match._id
    });

    // Emit notification
    const acceptor = await User.findById(userId).select('name');
    emitToUser(match.initiatedBy.toString(), 'match_accepted', {
      matchId: match._id,
      chatId,
      acceptedBy: acceptor
    });

    // Delete the match request notification
    await Notification.deleteMany({
      matchId: match._id,
      type: 'match_request'
    });

    res.json({ 
      message: "Match accepted!", 
      matched: true,
      chatId
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

    const match = await Match.findById(matchId);

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Check if user is part of this match
    if (match.user1.toString() !== userId && match.user2.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check if user is the one who received the request
    if (match.initiatedBy.toString() === userId) {
      return res.status(400).json({ error: "Cannot reject your own match request" });
    }

    // Update match status
    match.status = 'rejected';
    await match.save();

    // Delete the notification
    await Notification.deleteMany({
      matchId: match._id,
      type: 'match_request'
    });

    res.json({ message: "Match rejected" });
  } catch (error) {
    console.error("Reject match error:", error);
    res.status(500).json({ error: "Failed to reject match" });
  }
};