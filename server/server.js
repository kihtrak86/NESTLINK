require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const bookmarkRoutes = require("./routes/bookmarkRoutes");
const authRoutes = require("./routes/authRoutes");
const folderRoutes = require("./routes/folderRoutes");

const app = express();

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/bookmarks", bookmarkRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "TabShelf API is running" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 TabShelf server running on http://localhost:${PORT}`);
  });
});
