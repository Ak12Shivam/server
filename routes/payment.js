// server/routes/payment.js
// Razorpay subscription + one-time payment routes
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const User = require("../models/User");
const { requireAuth } = require("./auth");

const SubscriptionPlan = require("../models/SubscriptionPlan");
const PowerUp = require("../models/PowerUp");
const Tournament = require("../models/Tournament");

let razorpay;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  } else {
    console.warn("⚠️  Razorpay keys missing from environment. Payment features will be disabled.");
  }
} catch (err) {
  console.error("❌  Failed to initialize Razorpay:", err.message);
}

// ── Public catalogue endpoints (read-only, no auth needed) ───

// GET /api/payment/plans — active subscription plans from backend
router.get("/plans", async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ amount: 1 });
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payment/powerups — all power-ups from backend
router.get("/powerups", async (req, res) => {
  try {
    const powerUps = await PowerUp.find().sort({ price: 1 });
    res.json({ powerUps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payment/tournaments — all tournaments from backend
router.get("/tournaments", async (req, res) => {
  try {
    const tournaments = await Tournament.find({ status: { $in: ["upcoming", "active"] } }).sort({ startDate: 1 });
    res.json({ tournaments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Subscription routes ───────────────────────────────────────

// POST /api/payment/subscription/create
router.post("/subscription/create", requireAuth, async (req, res) => {
  try {
    const { plan: planKey } = req.body;
    const plan = await SubscriptionPlan.findOne({ key: planKey, isActive: true });
    if (!plan) return res.status(400).json({ error: "Invalid or inactive plan" });
    if (!razorpay) return res.status(503).json({ error: "Payments temporarily unavailable" });

    const rpPlan = await razorpay.plans.create({
      period: plan.period,
      interval: 1,
      item: { name: plan.name, amount: plan.amount, currency: "INR" },
    });

    const subscription = await razorpay.subscriptions.create({
      plan_id: rpPlan.id,
      customer_notify: 1,
      total_count: plan.period === "monthly" ? 12 : 1,
    });

    res.json({ subscriptionId: subscription.id, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Subscription create error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment/subscription/verify
router.post("/subscription/verify", requireAuth, async (req, res) => {
  try {
    const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    await User.findByIdAndUpdate(req.userId, {
      plan,
      premiumSince: new Date(),
      razorpaySubscriptionId: razorpay_subscription_id,
    });

    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Power-up routes ───────────────────────────────────────────

// POST /api/payment/powerup/order
router.post("/powerup/order", requireAuth, async (req, res) => {
  try {
    const { itemId } = req.body;
    console.log(`🛒 Order Request: itemId=${itemId} for userId=${req.userId}`);

    if (!itemId) return res.status(400).json({ error: "itemId is required" });

    // Try finding by ID first, then by key as fallback
    let item;
    if (mongoose.Types.ObjectId.isValid(itemId)) {
      item = await PowerUp.findById(itemId);
    }
    if (!item) {
      item = await PowerUp.findOne({ key: itemId });
    }

    if (!item) {
      console.error(`❌ Power-up not found in DB: ${itemId}`);
      return res.status(404).json({ error: "Power-up not found" });
    }
    if (!razorpay) return res.status(503).json({ error: "Payments temporarily unavailable" });

    console.log(`✨ Creating Razorpay order for: ${item.name} (${item.price} paise)`);

    const order = await razorpay.orders.create({
      amount: item.price, 
      currency: "INR",
      receipt: `powerup_${item.key}_${Date.now()}`,
      notes: { userId: req.userId, itemId: item._id, itemKey: item.key },
    });

    res.json({ orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amount: order.amount });
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment/powerup/verify
router.post("/powerup/verify", requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, itemId } = req.body;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    const updateKey = `powerUps.${itemId}`;
    await User.findByIdAndUpdate(req.userId, { $inc: { [updateKey]: 1 } });

    res.json({ success: true, itemId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tournament routes ─────────────────────────────────────────

// POST /api/payment/tournament/order
router.post("/tournament/order", requireAuth, async (req, res) => {
  try {
    const { tournamentId } = req.body;
    console.log(`🏆 Tournament Order Request: tournId=${tournamentId} for userId=${req.userId}`);

    if (!tournamentId) return res.status(400).json({ error: "tournamentId is required" });

    let t;
    if (mongoose.Types.ObjectId.isValid(tournamentId)) {
      t = await Tournament.findById(tournamentId);
    }

    if (!t) {
      console.error(`❌ Tournament not found in DB: ${tournamentId}`);
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (!razorpay) return res.status(503).json({ error: "Payments temporarily unavailable" });

    console.log(`✨ Creating Razorpay order for tournament: ${t.title} (${t.price} paise)`);

    const order = await razorpay.orders.create({
      amount: t.price, 
      currency: "INR",
      receipt: `tourn_${tournamentId}_${Date.now()}`,
      notes: { userId: req.userId, tournamentId: t._id },
    });
    res.json({ orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amount: order.amount });
  } catch (err) {
    console.error("❌ Razorpay tournament order error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment/tournament/verify
router.post("/tournament/verify", requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tournamentId } = req.body;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    await User.findByIdAndUpdate(req.userId, {
      $addToSet: { enteredTournaments: tournamentId },
    });

    await Tournament.findByIdAndUpdate(tournamentId, {
      $inc: { participants: 1 },
    });

    res.json({ success: true, tournamentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment/cancel-subscription
router.post("/cancel-subscription", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.razorpaySubscriptionId) return res.status(400).json({ error: "No active subscription" });
    if (!razorpay) return res.status(503).json({ error: "Payments temporarily unavailable" });

    await razorpay.subscriptions.cancel(user.razorpaySubscriptionId, { cancel_at_cycle_end: 1 });
    await User.findByIdAndUpdate(req.userId, { plan: "free", razorpaySubscriptionId: null, premiumSince: null });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
