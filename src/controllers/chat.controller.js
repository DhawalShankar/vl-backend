// chat.controller.js
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js"; // ✅ Import Notification model
import { getIO, emitToChat } from "../socket.js";
import Report from "../models/Report.js"; // Create Report model
import { translateMessage } from "../utils/translate.js"; // ✅ NEW: translation plugin
import { getLanguageCode } from "../utils/languageCodes.js"; // ✅ NEW: language name -> BCP-47 code
import { synthesizeSpeech } from "../utils/tts.js"; // new file, mirrors translate.js


// ✅ NEW: when a recipient knows more than one language, translate into
// whichever one they're most fluent in. Matches the actual enum on User
// (languagesKnow.fluency: 'Beginner' | 'Intermediate' | 'Advanced' | 'Native').
// Falls back to the first entry they added if fluency is missing/unrecognized.
const FLUENCY_RANK = { native: 3, advanced: 2, intermediate: 1, beginner: 0 };

const pickTargetLanguage = (languagesKnow = []) => {
  if (!languagesKnow.length) return null;

  const sorted = [...languagesKnow].sort((a, b) => {
    const rankA = FLUENCY_RANK[(a.fluency || "").toLowerCase()] ?? -1;
    const rankB = FLUENCY_RANK[(b.fluency || "").toLowerCase()] ?? -1;
    return rankB - rankA;
  });

  return getLanguageCode(sorted[0].language);
};

const MAX_TRANSLATION_BACKFILL = 30; // cap per fetch so a huge history doesn't hammer the API

// Translates one message for whoever didn't send it (the fixed "recipient"
// of that message). Returns null if translation isn't applicable/needed.
const translateOneMessage = async (message, chat) => {
  const recipient = chat.participants.find(
    p => p._id.toString() !== message.sender.toString()
  );
  if (!recipient?.translationPreference?.enabled) return null;

  const targetLang = pickTargetLanguage(recipient.languagesKnow);
  if (!targetLang) return null;

  const result = await translateMessage(message.text, targetLang);
  if (!result?.translatedText || result.detectedLang === targetLang) return null;

  return { translatedText: result.translatedText, translatedLang: targetLang };
};

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

// ✅ NEW: turn the translation plugin on/off for the current user.
// No language to pick — it's derived automatically from languagesKnow
// on every incoming message.
export const updateTranslationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { enabled } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { translationPreference: { enabled: !!enabled } },
      { new: true, select: 'translationPreference' }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "Translation settings updated",
      translationPreference: user.translationPreference
    });
  } catch (error) {
    console.error("Update translation settings error:", error);
    res.status(500).json({ error: "Failed to update translation settings" });
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
    }).populate('participants', 'name email translationPreference languagesKnow');

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.blockedBy.length > 0) {
      return res.status(403).json({ error: "Cannot send message - chat is blocked" });
    }

    const sender = chat.participants.find(p => p._id.toString() === userId);
    const recipient = chat.participants.find(p => p._id.toString() !== userId);
    const recipientId = recipient._id.toString();
    const trimmedText = text.trim();

    // ✅ No translation here anymore — always saved plain, translated after.
    const newMessage = {
      sender: userId,
      text: trimmedText,
      timestamp: new Date(),
      read: false,
      translatedText: null,
      translatedLang: null
    };

    chat.messages.push(newMessage);
    chat.lastMessage = new Date();
    await chat.save();

    const savedMessage = chat.messages[chat.messages.length - 1];
    const savedMessageId = savedMessage._id.toString();

    const messageData = {
      _id: savedMessageId,
      sender: savedMessage.sender.toString(),
      senderName: sender?.name || 'User',
      text: savedMessage.text,
      translatedText: null,
      translatedLang: null,
      timestamp: savedMessage.timestamp,
      read: savedMessage.read
    };

    // Emit message via Socket.IO to the chat room
    try {
      const io = getIO();

      io.to(`chat_${chatId}`).emit("receive_message", {
        chatId,
        message: messageData
      });

      console.log(`✅ Message emitted to chat_${chatId}:`, messageData);
    } catch (socketError) {
      console.error("Socket.io error:", socketError);
    }

    // ✅ NEW: Create notification for recipient
    try {
      await Notification.create({
        recipient: recipientId,
        sender: userId,
        type: "new_message",
        chatId: chatId,
        message: trimmedText.substring(0, 100), // Store first 100 chars as preview
        read: false
      });

      console.log(`✅ Notification created for user ${recipientId}`);

      // ✅ NEW: Emit notification to recipient's personal room
      const io = getIO();
      io.to(`user_${recipientId}`).emit("new_message_notification", {
        recipientId: recipientId,
        senderId: userId,
        chatId: chatId,
        message: trimmedText.substring(0, 100),
        sender: {
          name: sender?.name || 'User',
          _id: userId
        },
        type: "new_message",
        createdAt: new Date()
      });

      console.log(`✅ Notification emitted to user_${recipientId}`);
    } catch (notificationError) {
      console.error("Notification error:", notificationError);
      // Don't fail the message send if notification fails
    }

    // Respond immediately — everything below runs after, never delays send.
    res.json({
      message: "Message sent",
      messageData
    });

    // ✅ NEW: fire-and-forget translation, only if the recipient currently
    // has it enabled. On success, patches the saved message in Mongo and
    // emits a small "message_translated" event so an open chat updates live.
    if (recipient?.translationPreference?.enabled) {
      translateOneMessage(savedMessage, chat)
        .then(async (translation) => {
          if (!translation) return;

          await Chat.updateOne(
            { _id: chatId, "messages._id": savedMessageId },
            {
              $set: {
                "messages.$.translatedText": translation.translatedText,
                "messages.$.translatedLang": translation.translatedLang
              }
            }
          );

          try {
            const io = getIO();
            io.to(`chat_${chatId}`).emit("message_translated", {
              chatId,
              messageId: savedMessageId,
              translatedText: translation.translatedText,
              translatedLang: translation.translatedLang
            });
          } catch (socketError) {
            console.error("Socket.io error (message_translated):", socketError);
          }
        })
        .catch(err => console.error("Background translation failed:", err));
    }
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Failed to send message" });
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

      // ✅ NEW: Mark notifications as read when opening chat
      try {
        await Notification.updateMany(
          {
            recipient: userId,
            chatId: chatId,
            type: "new_message",
            read: false
          },
          { read: true }
        );
        console.log(`✅ Marked notifications as read for chat ${chatId}`);
      } catch (notifError) {
        console.error("Error marking notifications as read:", notifError);
      }

      // Emit read receipt via Socket.IO
      try {
        const io = getIO();
        io.to(`chat_${chatId}`).emit("messages_read", {
          userId,
          chatId,
          messageIds: messagesToMarkRead,
          readBy: userId
        });

        console.log(`✅ Marked ${messagesToMarkRead.length} messages as read in chat_${chatId}`);
      } catch (socketError) {
        console.log("Socket.io not available for read receipts");
      }
    }

    // ✅ NEW: backfill translations for the requesting user — covers
    // history that predates them turning translation on, and any message
    // whose background translation (from sendMessage) hasn't landed yet.
    const me = chat.participants.find(p => p._id.toString() === userId);
    if (me?.translationPreference?.enabled) {
      const untranslated = chat.messages
        .filter(msg => msg.sender.toString() !== userId && !msg.translatedText)
        .slice(-MAX_TRANSLATION_BACKFILL);

      if (untranslated.length) {
        let changed = false;
        for (const msg of untranslated) {
          const translation = await translateOneMessage(msg, chat);
          if (translation) {
            msg.translatedText = translation.translatedText;
            msg.translatedLang = translation.translatedLang;
            changed = true;
          }
        }
        if (changed) await chat.save();
      }
    }

    const otherUser = chat.participants.find(p => p._id.toString() !== userId);

    // Convert sender ObjectIds to strings
    const formattedMessages = chat.messages.map(msg => ({
      _id: msg._id.toString(),
      sender: msg.sender.toString(),
      text: msg.text,
      translatedText: msg.translatedText || null, // ✅ NEW
      translatedLang: msg.translatedLang || null, // ✅ NEW
      timestamp: msg.timestamp,
      read: msg.read
    }));

    res.json({
      chat: {
        id: chat._id,
        user: otherUser,
        messages: formattedMessages,
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
      io.to(`chat_${chatId}`).emit("user_blocked", { chatId, blockedBy: userId });
      console.log(`✅ Block notification sent to chat_${chatId}`);
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
      io.to(`chat_${chatId}`).emit("user_unblocked", { chatId, unblockedBy: userId });
      console.log(`✅ Unblock notification sent to chat_${chatId}`);
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

    // Add current user to deletedBy array
    if (!chat.deletedBy.includes(userId)) {
      chat.deletedBy.push(userId);
    }

    // ✅ Check if both participants deleted
    const bothDeleted = chat.participants.every(participantId =>
      chat.deletedBy.some(deletedId => deletedId.toString() === participantId.toString())
    );

    if (bothDeleted) {
      // ✅ Permanently delete
      await Chat.findByIdAndDelete(chatId);
      await Notification.deleteMany({ chatId: chatId });

      console.log(`🗑️ Chat ${chatId} permanently deleted`);

      res.json({
        message: "Chat permanently deleted",
        permanentlyDeleted: true
      });
    } else {
      // ✅ Soft delete for one user
      await chat.save();

      console.log(`📝 Chat ${chatId} deleted for user ${userId}`);

      res.json({
        message: "Chat deleted successfully",
        permanentlyDeleted: false
      });
    }
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

    // ✅ Save to database
    await Report.create({
      reporter: userId,
      reportedUser: reportedUser._id,
      chatId: chatId,
      reason: reason || 'No reason provided',
      timestamp: new Date()
    });

    console.log('📝 Report saved to database');
    res.json({ message: "Report submitted successfully" });
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
};

// ✅ NEW: on-demand pronunciation for any message. No preference check —
// anyone can tap it. Caches the audio URL/base64 on the message so repeat
// taps don't re-hit the API.
export const pronounceMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId, messageId } = req.params;

    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    const message = chat.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Already cached — return it, no API call
    if (message.audioData) {
      return res.json({ audioData: message.audioData, audioFormat: message.audioFormat });
    }

    // Pronounce whichever text is on screen for the requester: if this
    // message has a translation and they're likely reading the translated
    // version, prefer that — otherwise use the original text.
    const { lang } = req.query; // "original" | "translated", from frontend
    const textToSpeak = lang === "translated" && message.translatedText
      ? message.translatedText
      : message.text;
    const langCode = lang === "translated" && message.translatedLang
      ? message.translatedLang
      : null; // null = auto-detect on the TTS side if supported, else default

    const result = await synthesizeSpeech(textToSpeak, langCode);

    if (!result?.audioData) {
      return res.status(502).json({ error: "Could not generate audio" });
    }

    // Cache on the message so repeat taps are free
    message.audioData = result.audioData;
    message.audioFormat = result.audioFormat || "wav";
    await chat.save();

    res.json({ audioData: message.audioData, audioFormat: message.audioFormat });
  } catch (error) {
    console.error("Pronounce message error:", error);
    res.status(500).json({ error: "Failed to generate pronunciation" });
  }
};