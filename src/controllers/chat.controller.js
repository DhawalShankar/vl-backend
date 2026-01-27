import Chat from "../models/Chat.js";
import User from "../models/User.js";
import nodemailer from "nodemailer";

export const getMyChats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const chats = await Chat.find({
      participants: userId,
      deletedBy: { $ne: userId }
    })
    .populate('participants', '-password')
    .sort({ lastMessage: -1 });

    const formattedChats = chats.map(chat => {
      const otherUser = chat.participants.find(p => p._id.toString() !== userId);
      const lastMsg = chat.messages[chat.messages.length - 1];
      const unreadCount = chat.messages.filter(
        msg => !msg.read && msg.sender.toString() !== userId
      ).length;

      return {
        id: chat._id,
        user: otherUser,
        lastMessage: lastMsg?.text || '',
        timestamp: lastMsg?.timestamp || chat.createdAt,
        unread: unreadCount,
        isBlocked: chat.blockedBy.includes(userId)
      };
    });

    res.json({ chats: formattedChats });
  } catch (error) {
    console.error("Get chats error:", error);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};

export const getChatMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId,
      deletedBy: { $ne: userId }
    }).populate('participants', '-password');

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Mark messages as read
    chat.messages.forEach(msg => {
      if (msg.sender.toString() !== userId && !msg.read) {
        msg.read = true;
      }
    });
    await chat.save();

    const otherUser = chat.participants.find(p => p._id.toString() !== userId);

    res.json({ 
      chat: {
        id: chat._id,
        user: otherUser,
        messages: chat.messages,
        isBlocked: chat.blockedBy.includes(userId)
      }
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Check if user is blocked
    if (chat.blockedBy.length > 0) {
      return res.status(403).json({ error: "Cannot send message - chat is blocked" });
    }

    chat.messages.push({
      sender: userId,
      text: text.trim(),
      timestamp: new Date(),
      read: false
    });
    chat.lastMessage = new Date();
    await chat.save();

    res.json({ 
      message: "Message sent",
      messageData: chat.messages[chat.messages.length - 1]
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
};

export const blockUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (!chat.blockedBy.includes(userId)) {
      chat.blockedBy.push(userId);
      await chat.save();
    }

    res.json({ message: "User blocked successfully" });
  } catch (error) {
    console.error("Block user error:", error);
    res.status(500).json({ error: "Failed to block user" });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    chat.blockedBy = chat.blockedBy.filter(id => id.toString() !== userId);
    await chat.save();

    res.json({ message: "User unblocked successfully" });
  } catch (error) {
    console.error("Unblock user error:", error);
    res.status(500).json({ error: "Failed to unblock user" });
  }
};

export const deleteChat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (!chat.deletedBy.includes(userId)) {
      chat.deletedBy.push(userId);
      await chat.save();
    }

    res.json({ message: "Chat deleted successfully" });
  } catch (error) {
    console.error("Delete chat error:", error);
    res.status(500).json({ error: "Failed to delete chat" });
  }
};

export const reportUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;
    const { reason } = req.body;

    const chat = await Chat.findById(chatId).populate('participants', 'name email');
    const reporter = await User.findById(userId);
    
    if (!chat || !reporter) {
      return res.status(404).json({ error: "Chat or user not found" });
    }

    const reportedUser = chat.participants.find(p => p._id.toString() !== userId);

    // Send email (configure your email service)
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: 'mymail@gmail.com',
      subject: `User Report - VartaLang`,
      html: `
        <h2>User Report</h2>
        <p><strong>Reporter:</strong> ${reporter.name} (${reporter.email})</p>
        <p><strong>Reported User:</strong> ${reportedUser.name} (${reportedUser.email})</p>
        <p><strong>Reason:</strong> ${reason || 'No reason provided'}</p>
        <p><strong>Chat ID:</strong> ${chatId}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      `
    });

    res.json({ message: "Report submitted successfully" });
  } catch (error) {
    console.error("Report user error:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
};