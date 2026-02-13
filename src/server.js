// server.js
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import http from "http";
import { initializeSocket } from "./socket.js";
import matchRoutes from "./routes/match.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import authRoutes from "./routes/auth.routes.js";
import jobRoutes from "./routes/job.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { initializeJobSchedulers } from "./utils/jobScheduler.js";


dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);
initializeJobSchedulers();
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173", // Add your local frontend
  "https://vartalang.vercel.app",
  "https://vartalang.in",
  "https://www.vartalang.in"
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS blocked"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
app.use("/auth", authRoutes);
app.use("/matches", matchRoutes);
app.use("/chats", chatRoutes);
app.use("/notifications", notificationRoutes);
app.use("/jobs", jobRoutes);
app.use("/admin", adminRoutes);  // ← ADD THIS
// Health check endpoint
app.get("/", (req, res) => {
  res.json({ message: "VartaLang API is running" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  // ❌ WRONG: console.log`🚀 Backend running on port ${PORT}`;
  // ✅ CORRECT:
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`🔌 Socket.IO ready for connections`);
});