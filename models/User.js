const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    password:    { type: String, select: false },             // Hashed password
    isVerified:  { type: Boolean, default: false },           // Email verification status
    email:       { type: String, required: true, unique: true },
    name:        { type: String, required: true },
    avatar:      { type: String, default: "runner" },
    mode:        { type: String, enum: ["runner", "walker", "cyclist"], default: "runner" },
    totalHexes:  { type: Number, default: 0 },
    distance:    { type: Number, default: 0 },
    rank:        { type: Number, default: 9999 },
    clanId:      { type: mongoose.Schema.Types.ObjectId, ref: "Clan", default: null },
    recaptures:  { type: Number, default: 0 },
    achievements:            { type: [String], default: [] },
    plan:        { type: String, enum: ["free", "premium_monthly", "premium_yearly"], default: "free" },
    premiumSince:            { type: Date, default: null },
    razorpaySubscriptionId:  { type: String, default: null },
    powerUps:                { type: mongoose.Schema.Types.Mixed, default: {} },
    enteredTournaments:      { type: [String], default: [] },
    city:                    { type: String, default: "Unknown" },
    state:                   { type: String, default: "Unknown" },
    country:                 { type: String, default: "Unknown" },
  },
  { timestamps: true }
);

userSchema.index({ totalHexes: -1 });
userSchema.index({ distance: -1 });

module.exports = mongoose.model("User", userSchema);
