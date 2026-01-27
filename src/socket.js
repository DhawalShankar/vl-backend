import { Server } from "socket.io";

let io;

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "https://vartalang.vercel.app",
        "https://vartalang.in",
        "https://www.vartalang.in"
      ],
      credentials: true,
    },
  });

  // Store online users: { userId: socketId }
  const onlineUsers = new Map();

  io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    // User joins with their userId
    socket.on("user_online", (userId) => {
      onlineUsers.set(userId, socket.id);
      console.log(`User ${userId} is online`);
      
      // Notify user's chat partners that they're online
      socket.broadcast.emit("user_status", { userId, status: "online" });
    });

    // Join a specific chat room
    socket.on("join_chat", (chatId) => {
      socket.join(chatId);
      console.log(`Socket ${socket.id} joined chat: ${chatId}`);
    });

    // Leave a chat room
    socket.on("leave_chat", (chatId) => {
      socket.leave(chatId);
      console.log(`Socket ${socket.id} left chat: ${chatId}`);
    });

    // Send message to chat room
    socket.on("send_message", (data) => {
      const { chatId, message } = data;
      // Broadcast to all users in that chat room except sender
      socket.to(chatId).emit("receive_message", message);
    });

    // Typing indicator
    socket.on("typing_start", (data) => {
      const { chatId, userName } = data;
      socket.to(chatId).emit("user_typing", { userName });
    });

    socket.on("typing_stop", (chatId) => {
      socket.to(chatId).emit("user_stopped_typing");
    });

    // Mark messages as read
    socket.on("mark_read", (data) => {
      const { chatId, userId } = data;
      socket.to(chatId).emit("messages_read", { userId });
    });

    // User disconnect
    socket.on("disconnect", () => {
      console.log("❌ User disconnected:", socket.id);
      
      // Find and remove user from onlineUsers
      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          socket.broadcast.emit("user_status", { userId, status: "offline" });
          break;
        }
      }
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

export const emitToUser = (userId, event, data) => {
  if (io) {
    io.emit(event, { userId, ...data });
  }
};