require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const path = require("path");

// Resolve models relative to server directory
const PowerUp = require("./models/PowerUp");
const SubscriptionPlan = require("./models/SubscriptionPlan");
const Tournament = require("./models/Tournament");

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI not found in .env");
    }
    await mongoose.connect(process.env.MONGODB_URI);

    // 1. Clean and Seed Power-Ups
    console.log("Updating Power-ups with valid Ionicons...");
    await PowerUp.deleteMany({});
    const powerUps = await PowerUp.insertMany([
      {
        name: "Turbo Boost",
        key: "turbo_boost",
        price: 3100,
        description: "2x capture speed for 30 minutes. Perfect for hitting many hexes quickly.",
        icon: "flash",
      },
      {
        name: "XP Ribbon",
        key: "double_xp",
        price: 5100,
        description: "Gain 2x experience points from all activities for 1 hour.",
        icon: "ribbon",
      },
      {
        name: "Vision Radar",
        key: "range_booster",
        price: 6100,
        description: "Increases your capture radius on the map by 50%.",
        icon: "radio",
      },
      {
        name: "Golden Footsteps",
        key: "gold_fx",
        price: 8100,
        description: "Leave a glowing trail on the map for all players to see.",
        icon: "color-palette",
      },
      {
        name: "Territory Shield",
        key: "shield",
        price: 9900,
        description: "Protect your hexes from capture for 2 hours.",
        icon: "shield-checkmark",
      }
    ]);
    console.log(`✅ Seeded ${powerUps.length} Power-ups (Valid Ionicons)`);

    // 2. Seed Subscription Plans (if none exist)
    const existingPlans = await SubscriptionPlan.countDocuments();
    if (existingPlans === 0) {
      console.log("Seeding Subscription Plans...");
      await SubscriptionPlan.insertMany([
        {
          name: "Premium Monthly",
          key: "premium_monthly",
          amount: 19900,
          currency: "INR",
          period: "monthly",
          interval: 1,
          description: "Full access to all features, custom map themes, and no cooldowns.",
          isActive: true
        },
        {
          name: "Premium Yearly",
          key: "premium_yearly",
          amount: 149900,
          currency: "INR",
          period: "yearly",
          interval: 1,
          description: "Best value. Full year of premium access with 2 months free.",
          isActive: true
        }
      ]);
      console.log("✅ Seeded Subscription Plans");
    }

    // 3. Seed a Tournament (if none exist)
    const existingTourneys = await Tournament.countDocuments();
    if (existingTourneys === 0) {
      console.log("Seeding Sample Tournament...");
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 30); // 30 days tournament

      await Tournament.create({
        title: "City Sprint 2026",
        description: "The ultimate race for territory. Capture the most hexes this month to win!",
        price: 49900,
        startDate: start,
        endDate: end,
        status: "active",
        participants: 0
      });
      console.log("✅ Seeded Sample Tournament");
    }

    console.log("\n🚀 All data seeded successfully. Restart your app to see changes.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err.message);
    process.exit(1);
  }
}

seed();
