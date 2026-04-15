// server/routes/auth.js
// Custom OTP Authentication — One-time passwords via email + Password backup

const express = require("express");
const router  = express.Router();
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");
const User    = require("../models/User");

// Temporary store for OTPs (in-memory)
// { [email]: { otp, expires } }
const otpStore = new Map();

// ── POST /api/auth/send-otp ──────────────────────────────────
// Sends a 6-digit OTP to the provided email.
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(email, {
    otp,
    expires: Date.now() + 5 * 60 * 1000, // 5 min
  });

  const transporter = req.app.get("nodemailer_transporter");
  try {
    await transporter.sendMail({
      from: `"RunWars" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your RunWars Authentication Code",
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #000;">
          <h2>Join the RunWars 🚀</h2>
          <p>Your authentication code is:</p>
          <h1 style="font-size: 32px; letter-spacing: 12px; color: #FF6B47;">${otp}</h1>
          <p>This code expires in 5 minutes.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("Mail error:", err.message);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ── POST /api/auth/verify-otp ───────────────────────────────
// Only verifies the OTP code. Sign-up/Login proceeds after this.
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  const data = otpStore.get(email);

  if (!data) return res.status(400).json({ error: "No OTP sent for this email" });
  if (Date.now() > data.expires) {
    otpStore.delete(email);
    return res.status(400).json({ error: "OTP has expired" });
  }
  if (data.otp !== otp) return res.status(400).json({ error: "Invalid OTP code" });

  // Code is valid! Mark as verified in some temporary way or return success
  // We'll trust the email is verified for the next step (Register or Login)
  // otpStore.delete(email); // Delete only after registration/login is complete? 
  // For now, keep it for 30 more seconds to allow the register call to "see" it if needed.
  res.json({ status: "verified", message: "OTP verified. Proceed to next step." });
});

// ── POST /api/auth/register ──────────────────────────────────
// Final step of sign-up: sets name and password.
router.post("/register", async (req, res) => {
  try {
    const { email, otp, password, name } = req.body;
    
    // Safety check: Verify the OTP again (stateless verification for the final step)
    const data = otpStore.get(email);
    if (!data || data.otp !== otp) return res.status(400).json({ error: "Invalid or expired OTP session" });

    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be >= 6 chars" });

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: "User already exists. Please login." });

    const hashedPassword = await bcrypt.hash(password, 10);
    user = new User({
      email,
      name: name || email.split("@")[0],
      password: hashedPassword,
      isVerified: true,
    });
    await user.save();
    otpStore.delete(email);

    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        mode: user.mode,
        totalHexes: user.totalHexes,
        distance: user.distance,
        rank: user.rank,
        plan: user.plan,
        achievements: user.achievements,
        clanId: user.clanId,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
// Standard email/password login.
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password"); // Need protected password field
    if (!user) return res.status(401).json({ error: "Account not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Incorrect password" });

    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        mode: user.mode,
        totalHexes: user.totalHexes,
        distance: user.distance,
        rank: user.rank,
        plan: user.plan,
        achievements: user.achievements,
        clanId: user.clanId,
        avatar: user.avatar,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/auth/me ───────────────────────────────────────
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const { name, mode } = req.body;
    const update = {};
    if (name) update.name = name;
    if (mode) update.mode = mode;
    const user = await User.findByIdAndUpdate(req.userId, update, { new: true }).lean();
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── JWT middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
  try {
    const { userId } = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: "Token expired or invalid" });
  }
}

module.exports = { router, requireAuth };
