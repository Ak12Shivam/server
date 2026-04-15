const mongoose = require("mongoose");

const hexSchema = new mongoose.Schema(
  {
    hexId: { type: String, required: true, index: true },
    lat: Number,
    lng: Number,
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ownerName: { type: String, default: null },
    mode: { type: String, enum: ["runner", "walker", "cyclist", null], default: null },
    capturedAt: { type: Date, default: null },
    strength: { type: Number, default: 1.0 },
    city: { type: String, default: "unknown" },
  },
  { timestamps: true }
);

hexSchema.index({ lat: 1, lng: 1 });
hexSchema.index({ ownerId: 1 });

module.exports = mongoose.model("HexCell", hexSchema);
