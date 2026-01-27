import { Server } from "socket.io";
import jwt from "jsonwebtoken";

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

    // User authentication and joining
    socket.on("user_online", async (data) => {
      try {
        const { userId, token } = data;
        
        // Optional: Verify JWT token
        if (token && process.env.JWT_SECRET) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.userId !== userId) {
              socket.emit("auth_error", { message: "Invalid token" });
              return;
            }
          } catch (err) {
            console.log("Token verification failed, continuing anyway");
          }
        }

        // Store user mapping
        onlineUsers.set(userId, socket.id);
        socket.userId = userId; // Store on socket for easy access
        
        console.log(`✅ User ${userId} is online (socket: ${socket.id})`);
        
        // Notify all users that this user is online
        socket.broadcast.emit("user_status", { userId, status: "online" });
        
        // Confirm connection to the user
        socket.emit("connected", { userId, socketId: socket.id });
      } catch (error) {
        console.error("Error in user_online:", error);
        socket.emit("error", { message: "Failed to connect" });
      }
    });

    // Join a specific chat room
    socket.on("join_chat", (chatId) => {
      socket.join(chatId);
      console.log(`✅ Socket ${socket.id} (User: ${socket.userId}) joined chat: ${chatId}`);
      
      // Notify others in the chat that user joined
      socket.to(chatId).emit("user_joined_chat", { 
        chatId, 
        userId: socket.userId 
      });
    });

    // Leave a chat room
    socket.on("leave_chat", (chatId) => {
      socket.leave(chatId);
      console.log(`Socket ${socket.id} left chat: ${chatId}`);
    });

    // Typing indicator
    socket.on("typing_start", (data) => {
      const { chatId, userName } = data;
      socket.to(chatId).emit("user_typing", { userName, chatId });
    });

    socket.on("typing_stop", (chatId) => {
      socket.to(chatId).emit("user_stopped_typing", { chatId });
    });

    // User disconnect
    socket.on("disconnect", () => {
      console.log("❌ User disconnected:", socket.id);
      
      // Find and remove user from onlineUsers
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        socket.broadcast.emit("user_status", { 
          userId: socket.userId, 
          status: "offline" 
        });
        console.log(`User ${socket.userId} went offline`);
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

// Helper to emit to specific user by userId
export const emitToUser = (userId, event, data) => {
  if (io) {
    io.emit(event, { userId, ...data });
  }
};

// Helper to emit to a specific chat room
export const emitToChat = (chatId, event, data) => {
  if (io) {
    io.to(chatId).emit(event, data);
  }
};