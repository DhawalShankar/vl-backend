import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

dotenv.config();

const app = express();
const allowedOrigins = [
  "http://localhost:3000",
  "https://vl-frontend.onrender.com" // future frontend
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

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(console.error);

import authRoutes from "./routes/auth.routes.js"; // Adjusted to match the casing
app.use("/auth", authRoutes);

app.listen(process.env.PORT, () =>
  console.log(`Backend running on ${process.env.PORT}`)
);
