// chat.controller.js
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { getIO, emitToChat } from "../socket.js";
import Report from "../models/Report.js";
import { translateMessage } from "../utils/translate.js";
import { getLanguageCode } from "../utils/languageCodes.js";
import { synthesizeSpeech } from "../utils/tts.js";


// When a recipient knows more than one language, translate into
// whichever one they're most fluent in.
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

// Message ids we already tried (failed) or skipped (same language). Stops
// getChatMessages from re-calling the API for them on every chat open.
// In-memory: resets on server restart, which is fine.
const handledTranslations = new Set();
const markHandled = (id) => {
  if (!id) return;
  if (handledTranslations.size > 5000) handledTranslations.clear();
  handledTranslations.add(id);
};

// ---- Per-user "delete chat" helpers -------------------------------------
// deletedBy  -> chat hidden from the user's list
// clearedAt  -> per-user history cutoff (messages before it stay hidden,
//               even after the chat is restored by a new message)
const idEq = (a, b) => String(a) === String(b);

const isDeletedFor = (chat, userId) =>
  (chat.deletedBy || []).some((id) => idEq(id, userId));

const getCutoff = (chat, userId) =>
  (chat.clearedAt || []).find((c) => idEq(c.user, userId))?.at || null;

const getVisibleMessages = (chat, userId) => {
  const cutoff = getCutoff(chat, userId);
  if (!cutoff) return chat.messages;
  const cutoffTime = new Date(cutoff).getTime();
  return chat.messages.filter((m) => new Date(m.timestamp).getTime() > cutoffTime);
};
// --------------------------------------------------------------------------

// Language both users matched on: something the sender knows that the
// recipient is learning. Recipient's primary learning language wins.
const pickFallbackSource = (sender, recipient) => {
  const senderKnown = new Set(
    (sender?.languagesKnow || []).map((l) => (l.language || "").trim().toLowerCase())
  );
  const learning = [
    recipient?.primaryLanguageToLearn,
    recipient?.secondaryLanguageToLearn
  ].filter(Boolean);

  for (const lang of learning) {
    if (senderKnown.has(lang.trim().toLowerCase())) {
      const code = getLanguageCode(lang);
      if (code) return code;
    }
  }
  return null;
};

// Translates one message for whoever didn't send it. Returns null if
// translation isn't applicable/needed/possible.
const translateOneMessage = async (message, chat) => {
  const msgId = message._id?.toString();
  if (msgId && handledTranslations.has(msgId)) return null;

  const sender = chat.participants.find(
    (p) => p._id.toString() === message.sender.toString()
  );
  const recipient = chat.participants.find(
    (p) => p._id.toString() !== message.sender.toString()
  );
  if (!recipient?.translationPreference?.enabled) return null;

  const targetLang = pickTargetLanguage(recipient.languagesKnow);
  if (!targetLang) return null;

  const fallbackSource = pickFallbackSource(sender, recipient);

  const result = await translateMessage(message.text, targetLang, fallbackSource);

  // Failed, or message is already in the target language: don't retry again
  const baseLang = (c) => (c || "").split("-")[0].toLowerCase();
  if (!result?.translatedText || baseLang(result.detectedLang) === baseLang(targetLang)) {
    markHandled(msgId);
    return null;
  }

  return { translatedText: result.translatedText, translatedLang: targetLang };
};

export const getMyChats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const chats = await Chat.find({
      participants: userId,
      deletedBy: { $ne: userId }
    })
    .select('-messages.audioData')
    .populate('participants', '-password')
    .sort({ lastMessage: -1 });

    const formattedChats = chats.map(chat => {
      const otherUser = chat.participants.find(p => p._id.toString() !== userId);

      // only messages after this user's clear-cutoff count
      const visible = getVisibleMessages(chat, userId);
      const lastMsg = visible[visible.length - 1];
      const unreadCount = visible.filter(
        msg => !msg.read && msg.sender.toString() !== userId
      ).length;

      return {
        id: chat._id,
        user: otherUser,
        lastMessage: lastMsg?.text || '',
        timestamp: lastMsg?.timestamp || chat.createdAt,
        unread: unreadCount,
        isBlocked: chat.blockedBy.some(id => idEq(id, userId))
      };
    });

    res.json({ chats: formattedChats });
  } catch (error) {
    console.error("Get chats error:", error);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};

// Turn the translation plugin on/off for the current user.
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

    // learning-language fields are needed for the translation fallback
    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId
    }).select('-messages.audioData').populate(
      'participants',
      'name email translationPreference languagesKnow primaryLanguageToLearn secondaryLanguageToLearn'
    );

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

    // If anyone had deleted this chat, bring it back. clearedAt is left
    // untouched, so their old history stays hidden.
    const wasHiddenForRecipient = isDeletedFor(chat, recipientId);
    if (chat.deletedBy.length > 0) {
      chat.deletedBy = [];
    }

    // No translation here — always saved plain, translated after.
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
      emitToChat(chatId, "receive_message", { chatId, message: messageData });

      // Recipient had deleted the chat: tell their client to refetch the list
      if (wasHiddenForRecipient) {
        getIO().to(`user_${recipientId}`).emit("chat_restored", { chatId });
      }

      console.log(`✅ Message emitted to chat_${chatId}:`, messageData);
    } catch (socketError) {
      console.error("Socket.io error:", socketError);
    }

    // Create notification for recipient
    try {
      await Notification.create({
        recipient: recipientId,
        sender: userId,
        type: "new_message",
        chatId: chatId,
        message: trimmedText.substring(0, 100),
        read: false
      });

      console.log(`✅ Notification created for user ${recipientId}`);

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

    // Fire-and-forget translation, only if the recipient currently has it
    // enabled. On success, patches the saved message in Mongo and emits a
    // "message_translated" event so an open chat updates live.
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
            emitToChat(chatId, "message_translated", {
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
    }).select('-messages.audioData').populate('participants', '-password');

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

      // Mark notifications as read when opening chat
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
        emitToChat(chatId, "messages_read", {
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

    // Only messages after this user's clear-cutoff are ever shown or translated
    const visibleMessages = getVisibleMessages(chat, userId);

    // Backfill translations for the requesting user — covers history that
    // predates them turning translation on, and any message whose
    // background translation hasn't landed yet. Messages that already
    // failed/skipped are remembered in handledTranslations, so no repeat calls.
    const me = chat.participants.find(p => p._id.toString() === userId);
    if (me?.translationPreference?.enabled) {
      const untranslated = visibleMessages
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

    const formattedMessages = visibleMessages.map(msg => ({
      _id: msg._id.toString(),
      sender: msg.sender.toString(),
      text: msg.text,
      translatedText: msg.translatedText || null,
      translatedLang: msg.translatedLang || null,
      timestamp: msg.timestamp,
      read: msg.read
    }));

    res.json({
      chat: {
        id: chat._id,
        user: otherUser,
        messages: formattedMessages,
        translationEnabled: Boolean(me?.translationPreference?.enabled),
        isBlocked: chat.blockedBy.some(id => idEq(id, userId))
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

    if (!chat.blockedBy.some(id => idEq(id, userId))) {
      chat.blockedBy.push(userId);
      await chat.save();
    }

    try {
      emitToChat(chatId, "user_blocked", { chatId, blockedBy: userId });
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

    try {
      emitToChat(chatId, "user_unblocked", { chatId, unblockedBy: userId });
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

    if (!isDeletedFor(chat, userId)) {
      chat.deletedBy.push(userId);
    }

    // History cutoff: everything up to now stays hidden for this user,
    // even if the chat comes back when the other person sends a message.
    chat.clearedAt = (chat.clearedAt || []).filter((c) => !idEq(c.user, userId));
    chat.clearedAt.push({ user: userId, at: new Date() });

    const bothDeleted = chat.participants.every(participantId =>
      chat.deletedBy.some(deletedId => deletedId.toString() === participantId.toString())
    );

    if (bothDeleted) {
      await Chat.findByIdAndDelete(chatId);
      await Notification.deleteMany({ chatId: chatId });

      console.log(`🗑️ Chat ${chatId} permanently deleted`);

      res.json({
        message: "Chat permanently deleted",
        permanentlyDeleted: true
      });
    } else {
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

// On-demand pronunciation for any message. Caches the audio on the message
// so repeat taps don't re-hit the API.
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

    if (message.audioData) {
      return res.json({ audioData: message.audioData, audioFormat: message.audioFormat });
    }

    // Always the original text, so one cached audio per message is always
    // correct and the TTS API is hit at most once per message.
    const result = await synthesizeSpeech(message.text, null);

    if (!result?.audioData) {
      return res.status(502).json({ error: "Could not generate audio" });
    }

    message.audioData = result.audioData;
    message.audioFormat = result.audioFormat || "wav";
    await chat.save();

    res.json({ audioData: message.audioData, audioFormat: message.audioFormat });
  } catch (error) {
    console.error("Pronounce message error:", error);
    res.status(500).json({ error: "Failed to generate pronunciation" });
  }
};

export const markChatAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId,
      deletedBy: { $ne: userId }
    }).select('-messages.audioData');

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

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

      await Notification.updateMany(
        { recipient: userId, chatId, type: "new_message", read: false },
        { read: true }
      );

      try {
        emitToChat(chatId, "messages_read", {
          userId,
          chatId,
          messageIds: messagesToMarkRead,
          readBy: userId
        });
      } catch (socketError) {
        console.log("Socket.io not available for read receipts");
      }
    }

    res.json({ message: "Chat marked as read", markedAsRead });
  } catch (error) {
    console.error("Mark chat as read error:", error);
    res.status(500).json({ error: "Failed to mark chat as read" });
  }
};