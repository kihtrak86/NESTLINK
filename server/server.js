require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const bookmarkRoutes = require("./routes/bookmarkRoutes");
const authRoutes = require("./routes/authRoutes");
const folderRoutes = require("./routes/folderRoutes");

const app = express();

// ------------------------------------
// CORS Configuration
// ------------------------------------
const allowedOrigins = [
  "http://localhost:5173",
  "https://nestlink-indol.vercel.app",
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL.replace(/\/+$/, "")] : []),
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (Postman, Thunder Client, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/bookmarks", bookmarkRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "NestLink API is running",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(500).json({
    message: "Something went wrong on the server",
  });
});

// Start server only when executed directly (keeps app importable for tests)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 NestLink server running on port ${PORT}`);
    });
  });
}

module.exports = app;