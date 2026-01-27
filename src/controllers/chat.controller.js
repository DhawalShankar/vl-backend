import Chat from "../models/Chat.js";
import User from "../models/User.js";
import nodemailer from "nodemailer";
import { getIO, emitToChat } from "../socket.js";

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
    }).populate('participants', 'name email');

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Check if user is blocked
    if (chat.blockedBy.length > 0) {
      return res.status(403).json({ error: "Cannot send message - chat is blocked" });
    }

    // Create the message
    const newMessage = {
      sender: userId, // ✅ Store as ObjectId
      text: text.trim(),
      timestamp: new Date(),
      read: false
    };

    chat.messages.push(newMessage);
    chat.lastMessage = new Date();
    await chat.save();

    // Get the saved message with its _id
    const savedMessage = chat.messages[chat.messages.length - 1];
    
    // Get sender info
    const sender = chat.participants.find(p => p._id.toString() === userId);

    // ✅ CRITICAL: Convert sender ObjectId to string for frontend
    const messageData = {
      _id: savedMessage._id.toString(),
      sender: savedMessage.sender.toString(), // ✅ Convert to string
      senderName: sender?.name || 'User',
      text: savedMessage.text,
      timestamp: savedMessage.timestamp,
      read: savedMessage.read
    };

    // Emit message via Socket.IO to the chat room
    try {
      const io = getIO();
      
      // ✅ Emit immediately - no delay
      io.to(chatId).emit("receive_message", {
        chatId,
        message: messageData
      });
      
      console.log(`✅ Message emitted to chat ${chatId}:`, messageData);
    } catch (socketError) {
      console.error("Socket.io error:", socketError);
    }

    // Return message data to sender
    res.json({ 
      message: "Message sent",
      messageData
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
};

// ✅ Also fix getChatMessages to return sender as string
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
    let markedAsRead = false;
    const messagesToMarkRead = [];
    
    chat.messages.forEach(msg => {
      if (msg.sender.toString() !== userId && !msg.read) {
        msg.read = true;
        markedAsRead = true;
        messagesToMarkRead.push(msg._id);
      }
    });
    
    if (markedAsRead) {
      await chat.save();
      
      // Emit read receipt via Socket.IO
      try {
        const io = getIO();
        io.to(chatId).emit("messages_read", { 
          userId, 
          chatId,
          messageIds: messagesToMarkRead,
          readBy: userId 
        });
        
        console.log(`✅ Marked ${messagesToMarkRead.length} messages as read`);
      } catch (socketError) {
        console.log("Socket.io not available for read receipts");
      }
    }

    const otherUser = chat.participants.find(p => p._id.toString() !== userId);

    // ✅ Convert sender ObjectIds to strings
    const formattedMessages = chat.messages.map(msg => ({
      _id: msg._id.toString(),
      sender: msg.sender.toString(), // ✅ Convert to string
      text: msg.text,
      timestamp: msg.timestamp,
      read: msg.read
    }));

    res.json({ 
      chat: {
        id: chat._id,
        user: otherUser,
        messages: formattedMessages, // ✅ Use formatted messages
        isBlocked: chat.blockedBy.includes(userId)
      }
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
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

    // Notify via Socket.IO
    try {
      const io = getIO();
      emitToChat(chatId, "user_blocked", { chatId, blockedBy: userId });
    } catch (socketError) {
      console.log("Socket.io not available for block notification");
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

    // Notify via Socket.IO
    try {
      const io = getIO();
      emitToChat(chatId, "user_unblocked", { chatId, unblockedBy: userId });
    } catch (socketError) {
      console.log("Socket.io not available for unblock notification");
    }

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