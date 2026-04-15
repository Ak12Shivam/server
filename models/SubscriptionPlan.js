const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true },
    key:         { type: String, required: true, unique: true }, // e.g., 'premium_monthly'
    amount:      { type: Number, required: true }, // in paise
    currency:    { type: String, default: "INR" },
    period:      { type: String, enum: ["monthly", "yearly"], required: true },
    interval:    { type: Number, default: 1 },
    description: { type: String },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
