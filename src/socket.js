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
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000, // ✅ Increased timeout
    pingInterval: 25000, // ✅ Check connection every 25s
    allowEIO3: true
  });

  const onlineUsers = new Map();

  io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    socket.on("user_online", async (data) => {
      try {
        const { userId, token } = data;
        
        onlineUsers.set(userId, socket.id);
        socket.userId = userId;
        
        console.log(`✅ User ${userId} is online (socket: ${socket.id})`);
        
        socket.broadcast.emit("user_status", { userId, status: "online" });
        socket.emit("connected", { 
          userId, 
          socketId: socket.id,
          message: "Successfully connected"
        });
      } catch (error) {
        console.error("❌ Error in user_online:", error);
      }
    });

    socket.on("join_chat", (chatId) => {
      socket.join(chatId);
      console.log(`✅ User ${socket.userId} joined chat: ${chatId}`);
    });

    socket.on("leave_chat", (chatId) => {
      socket.leave(chatId);
      console.log(`❌ User ${socket.userId} left chat: ${chatId}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`❌ User disconnected: ${socket.id}, Reason: ${reason}`);
      
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        socket.broadcast.emit("user_status", { 
          userId: socket.userId, 
          status: "offline" 
        });
      }
    });
  });

  console.log("🔌 Socket.IO initialized");
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