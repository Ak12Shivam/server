const mongoose = require("mongoose");

const tournamentSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true },
    description: { type: String, required: true },
    price:       { type: Number, required: true }, // in paise
    startDate:   { type: Date, required: true },
    endDate:     { type: Date, required: true },
    status:      { type: String, enum: ["upcoming", "active", "completed"], default: "upcoming" },
    participants: { type: Number, default: 0 },
    image:       { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tournament", tournamentSchema);
