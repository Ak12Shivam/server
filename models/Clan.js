const mongoose = require("mongoose");

const clanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    tag: { type: String, required: true, maxlength: 6 },
    color: { type: String, default: "#FF6B47" },
    leaderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        name: String,
        mode: String,
        hexes: { type: Number, default: 0 },
        role: { type: String, enum: ["Commander", "Lieutenant", "Soldier", "Recruit"], default: "Recruit" },
      },
    ],
    totalHexes: { type: Number, default: 0 },
    rank: { type: Number, default: 9999 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Clan", clanSchema);
