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
  console.log(`✅ User ${socket.userId} connected`);

  // user room (for direct emits if needed later)
  socket.join(`user_${socket.userId}`);

  socket.on('join_chat', (roomName) => {
    socket.join(roomName);
    console.log(`💬 Joined ${roomName}`);
  });

  socket.on('leave_chat', (roomName) => {
    socket.leave(roomName);
  });

  socket.on('disconnect', () => {
    console.log(`❌ User ${socket.userId} disconnected`);
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