import User from "../models/User.js";
import Match from "../models/Match.js";
import Chat from "../models/Chat.js";

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
      status: action === 'like' ? 'matched' : 'rejected',
      initiatedBy: userId
    });

    // If it's a like, create a chat
    if (action === 'like') {
      const existingChat = await Chat.findOne({
        participants: { $all: [userId, targetUserId] }
      });

      if (!existingChat) {
        await Chat.create({
          participants: [userId, targetUserId],
          messages: []
        });
      }

      return res.json({ 
        message: "Match created!", 
        matched: true,
        chatId: existingChat?._id
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