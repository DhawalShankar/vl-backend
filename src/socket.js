// socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://vartalang.in",
  "https://www.vartalang.in",
  "https://vartalang.vercel.app"
];

export const emitToChat = (chatId, event, data) => {
  if (!io) throw new Error("Socket.io not initialized");
  io.to(`chat_${chatId}`).emit(event, data);
};

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Socket CORS blocked"));
        }
      },
      credentials: true,
    },
  });

  // Auth middleware
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(" ")[1];

      if (!token) return next(new Error("Authentication error"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`✅ User ${socket.userId} connected`);

    socket.join(`user_${socket.userId}`);

    socket.on("join_chat", (roomName) => {
      socket.join(roomName);
    });

    socket.on("leave_chat", (roomName) => {
      socket.leave(roomName);
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${socket.userId} disconnected`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
