// server/routes/game.js
// Leaderboard, hex map, notifications, clan routes
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const HexCell = require("../models/HexCell");
const Clan = require("../models/Clan");
const Notification = require("../models/Notification");
const { requireAuth } = require("./auth");

// ── Leaderboard ─────────────────────────────────────────────
// GET /api/game/leaderboard?mode=all&limit=50
router.get("/leaderboard", requireAuth, async (req, res) => {
  try {
    const { mode, limit = 50 } = req.query;
    const filter = mode && mode !== "all" ? { mode } : {};
    const users = await User.find(filter)
      .sort({ totalHexes: -1 })
      .limit(Number(limit))
      .lean();

    // Batch-fetch clan names for users that have a clan
    const clanIds = [...new Set(users.filter((u) => u.clanId).map((u) => String(u.clanId)))];
    const clans = clanIds.length > 0 ? await Clan.find({ _id: { $in: clanIds } }).select("name").lean() : [];
    const clanMap = Object.fromEntries(clans.map((c) => [String(c._id), c.name]));

    const leaderboard = users.map((u, i) => ({
      rank: i + 1,
      id: u._id,
      name: u.name,
      mode: u.mode,
      hexes: u.totalHexes,
      distance: u.distance,
      clanName: u.clanId ? (clanMap[String(u.clanId)] ?? null) : null,
      change: 0,
    }));
    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Hex Map ─────────────────────────────────────────────────
// GET /api/game/hexes?lat=&lng=&radius=0.02
router.get("/hexes", requireAuth, async (req, res) => {
  try {
    const { lat, lng, radius = 0.02 } = req.query;
    const r = Number(radius);
    const hexes = await HexCell.find({
      lat: { $gte: Number(lat) - r, $lte: Number(lat) + r },
      lng: { $gte: Number(lng) - r, $lte: Number(lng) + r },
    })
      .limit(200)
      .lean();
    res.json({ hexes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game/hexes/capture
// Body: { hexId, lat, lng, mode }
router.post("/hexes/capture", requireAuth, async (req, res) => {
  try {
    const { hexId, lat, lng, mode } = req.body;
    const user = await User.findById(req.userId);

    const existing = await HexCell.findOne({ hexId });
    if (existing && existing.ownerId?.toString() === req.userId) {
      return res.json({ captured: false, reason: "already_owned" });
    }

    // Defense scoring
    const defenseMap = { runner: 0.9, walker: 0.6, cyclist: 0.3 };
    if (existing?.ownerId) {
      const defense = defenseMap[existing.mode] ?? 0.5;
      if (Math.random() > 1 - defense + 0.3) {
        return res.json({ captured: false, reason: "defended" });
      }
    }

    const isRecapture = existing && existing.ownerId && existing.ownerId.toString() !== req.userId;
    
    await HexCell.findOneAndUpdate(
      { hexId },
      { hexId, lat, lng, ownerId: req.userId, ownerName: user.name, mode, capturedAt: new Date(), strength: 1.0 },
      { upsert: true, new: true }
    );

    const updates = { $inc: { totalHexes: 1 } };
    const awards = [];

    // Award: First Hex
    if (user.totalHexes === 0 && !user.achievements.includes("first_hex")) {
      awards.push("first_hex");
    }

    // Award: Defender
    if (isRecapture) {
      updates.$inc.recaptures = 1;
      if ((user.recaptures + 1) >= 10 && !user.achievements.includes("defender")) {
        awards.push("defender");
      }
    }

    if (awards.length > 0) {
      updates.$addToSet = { achievements: { $each: awards } };
    }

    await User.findByIdAndUpdate(req.userId, updates);

    res.json({ captured: true, achievementsEarned: awards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game/session/end
// Body: { distance, hexesCaptured }
router.post("/session/end", requireAuth, async (req, res) => {
  try {
    const { distance = 0 } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const updates = { $inc: { distance: Number(distance) } };
    
    // Award: Speed Demon (if they cover > 2km in a single session)
    if (Number(distance) > 2 && !user.achievements.includes("speed_demon")) {
      updates.$addToSet = { achievements: "speed_demon" };
    }

    await User.findByIdAndUpdate(req.userId, updates);
    res.json({ success: true, distanceAdded: distance });
  } catch (err) {
    console.error("Session end error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Notifications ───────────────────────────────────────────
// GET /api/game/notifications
router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ notifications: notifs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/game/notifications/:id/read
router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clan ────────────────────────────────────────────────────
// GET /api/game/clan — get my clan
router.get("/clan", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user.clanId) return res.json({ clan: null });
    const clan = await Clan.findById(user.clanId).lean();
    res.json({ clan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game/clan/join
// Body: { clanId }
router.post("/clan/join", requireAuth, async (req, res) => {
  try {
    const { clanId } = req.body;
    const user = await User.findById(req.userId);
    const clan = await Clan.findById(clanId);
    if (!clan) return res.status(404).json({ error: "Clan not found" });

    clan.members.push({ userId: req.userId, name: user.name, mode: user.mode, hexes: user.totalHexes, role: "Recruit" });
    await clan.save();

    await User.findByIdAndUpdate(req.userId, { clanId });
    res.json({ clan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game/clan/leave
router.post("/clan/leave", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.clanId) return res.status(400).json({ error: "Not in a clan" });

    await Clan.findByIdAndUpdate(user.clanId, { $pull: { members: { userId: req.userId } } });
    await User.findByIdAndUpdate(req.userId, { clanId: null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/game/clans — browse all clans (for clan discovery screen)
router.get("/clans", requireAuth, async (req, res) => {
  try {
    const clans = await Clan.find({})
      .sort({ totalHexes: -1 })
      .limit(50)
      .lean();
    // Compute member count and mode breakdown for each clan
    const result = clans.map((c, i) => ({
      id:         c._id,
      name:       c.name,
      tag:        c.tag,
      totalHexes: c.totalHexes,
      rank:       i + 1,
      memberCount: (c.members || []).length,
      modes:      (c.members || []).map((m) => m.mode).filter(Boolean),
      color:      c.color || "#FF6B47",
    }));
    res.json({ clans: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/game/clans/create — create a new clan
// Body: { name, tag }
router.post("/clans/create", requireAuth, async (req, res) => {
  try {
    const { name, tag } = req.body;
    if (!name || !tag) return res.status(400).json({ error: "name and tag required" });
    const user = await User.findById(req.userId);
    if (user.clanId) return res.status(400).json({ error: "Already in a clan. Leave first." });

    const existing = await Clan.findOne({ tag: tag.toUpperCase() });
    if (existing) return res.status(400).json({ error: "Tag already taken" });

    const clan = new Clan({
      name,
      tag: tag.toUpperCase().slice(0, 5),
      totalHexes: 0,
      rank: 9999,
      color: "#FF6B47",
      members: [{ userId: req.userId, name: user.name, mode: user.mode, hexes: user.totalHexes, role: "Commander" }],
    });
    await clan.save();
    await User.findByIdAndUpdate(req.userId, { clanId: clan._id });
    res.json({ clan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/game/city-stats — global territory distribution
router.get("/city-stats", async (req, res) => {
  try {
    const [runner, walker, cyclist] = await Promise.all([
      HexCell.countDocuments({ mode: "runner" }),
      HexCell.countDocuments({ mode: "walker" }),
      HexCell.countDocuments({ mode: "cyclist" }),
    ]);
    res.json({ runner, walker, cyclist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
