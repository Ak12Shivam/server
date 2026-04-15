const mongoose = require("mongoose");

const powerUpSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true },
    key:         { type: String, required: true, unique: true }, // e.g., 'speed_boost'
    price:       { type: Number, required: true }, // in paise
    description: { type: String },
    icon:        { type: String, default: "flash" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PowerUp", powerUpSchema);
