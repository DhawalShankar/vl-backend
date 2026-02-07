// socket.js 
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;

export const emitToChat = (chatId, event, data) => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  io.to(`chat_${chatId}`).emit(event, data);
};

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true
    }
  });

  // Socket authentication
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
    
    // Join user-specific room
    socket.join(`user_${socket.userId}`);
    console.log(`📍 User ${socket.userId} joined room: user_${socket.userId}`);

    // Optional: Track online status
    socket.on('user_online', () => {
      socket.broadcast.emit('user_status', { 
        userId: socket.userId, 
        status: 'online' 
      });
    });

    // ✅ FIXED: Accept room name directly (frontend already sends with chat_ prefix)
    socket.on('join_chat', (roomName) => {
      socket.join(roomName);  // ✅ Direct room name, NO prefix added
      console.log(`💬 User ${socket.userId} joined room: ${roomName}`);
    });

    socket.on('leave_chat', (roomName) => {
      socket.leave(roomName);  // ✅ Direct room name, NO prefix added
      console.log(`👋 User ${socket.userId} left room: ${roomName}`);
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