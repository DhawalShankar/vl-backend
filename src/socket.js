// socket.js - FIXED VERSION with proper user room management

import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;
export const emitToChat = (chatId, event, data) => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  io.to(`chat_${chatId}`).emit(event, data);
};

export { io as getIO };
export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true
    }
  });

  // ✅ FIXED: Socket authentication and room joining
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User ${socket.userId} connected to socket`);

    // ✅ CRITICAL: Join user-specific room for targeted notifications
    socket.join(`user_${socket.userId}`);
    console.log(`📍 User ${socket.userId} joined room: user_${socket.userId}`);

    // Optional: Track online status
    socket.on('user_online', () => {
      socket.broadcast.emit('user_status', { 
        userId: socket.userId, 
        status: 'online' 
      });
    });

    // Handle chat events
    socket.on('join_chat', (chatId) => {
      socket.join(`chat_${chatId}`);
      console.log(`💬 User ${socket.userId} joined chat: ${chatId}`);
    });

    socket.on('leave_chat', (chatId) => {
      socket.leave(`chat_${chatId}`);
      console.log(`👋 User ${socket.userId} left chat: ${chatId}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ User ${socket.userId} disconnected`);
      socket.broadcast.emit('user_status', { 
        userId: socket.userId, 
        status: 'offline' 
      });
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};