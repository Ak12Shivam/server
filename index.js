// server/index.js — RunWars Express + MongoDB + Custom OTP Auth backend
// ★ Credentials needed in .env:
//   MONGODB_URI, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
//   JWT_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { router: authRouter } = require("./routes/auth");
const gameRouter = require("./routes/game");
const paymentRouter = require("./routes/payment");

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Environment Validation ───────────────────────────────────
const REQUIRED_ENV = ["MONGODB_URI", "JWT_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"];
REQUIRED_ENV.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌  Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

// ── Security Middleware ───────────────────────────────────────
app.use(helmet()); // Set focus security headers
app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE"] }));
app.use(express.json());

// Apply rate limiting (Global: 100 requests per 15 minutes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use("/api/", limiter); // Apply to API routes only

// ── Nodemailer Transporter ──────────────────────────────────
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
app.set("nodemailer_transporter", transporter);

// ── MongoDB ──────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("✅  MongoDB connected"))
  .catch((err) => {
    console.error("❌  MongoDB connection failed:", err.message);
    console.error("    Check MONGODB_URI in your .env file");
    process.exit(1);
  });

// ── Root Health Check ────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ 
    status: "online", 
    message: "RunWars API is Live",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// ── Routes ───────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/game", gameRouter);
app.use("/api/payment", paymentRouter);

// ── Razorpay Webhook ─────────────────────────────────────────
// Razorpay sends payment events to this endpoint.
// Set webhook URL in Razorpay Dashboard → Settings → Webhooks
app.post("/api/webhooks/razorpay", express.raw({ type: "*/*" }), (req, res) => {
  const crypto = require("crypto");
  const sig = req.headers["x-razorpay-signature"];
  const body = req.body.toString();

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (sig !== expected) return res.status(400).send("Invalid signature");

  const event = JSON.parse(body);
  console.log("Razorpay webhook:", event.event);

  // Handle subscription cancellation / payment failure here if needed
  res.json({ received: true });
});

// ── Static (production web build) ───────────────────────────
const distDir = path.join(__dirname, "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_, res) => res.sendFile(path.join(distDir, "index.html")));
}

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Internal Server Error:", err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? "An unexpected error occurred." : err.message,
  });
});

const server = app.listen(PORT, "0.0.0.0", () => console.log(`🚀  Server running on http://localhost:${PORT}`));

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} is already in use.`);
    console.error(`    Run this to free it (Windows):`);
    console.error(`    Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess | Stop-Process -Force`);
    console.error(`    Then re-run: npm run server:dev\n`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
