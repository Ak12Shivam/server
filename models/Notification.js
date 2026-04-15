const mongoose = require("mongoose");

const notifSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: String,
    message: String,
    type: { type: String, enum: ["attack", "defend", "clan", "achievement", "decay"] },
    mode: { type: String, enum: ["runner", "walker", "cyclist"] },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notifSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notifSchema);
