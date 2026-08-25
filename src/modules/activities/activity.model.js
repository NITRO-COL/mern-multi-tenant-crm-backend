import mongoose from "mongoose";
import { tenantPlugin } from "../../shared/tenantPlugin.js";

export const ACTIVITY_TYPES = ["CALL", "MEETING", "EMAIL", "NOTE", "TASK"];

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ACTIVITY_TYPES, required: [true, "Activity type is required"] },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },

    /** Exactly one of these is set — enforced in the service layer. */
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },

    dueAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

activitySchema.plugin(tenantPlugin);

// Timelines are always "newest first for one record", hence the -1 on createdAt.
activitySchema.index({ tenantId: 1, leadId: 1, createdAt: -1 });
activitySchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
activitySchema.index({ tenantId: 1, createdAt: -1 });
activitySchema.index({ tenantId: 1, type: 1, createdAt: -1 });

export const Activity = mongoose.model("Activity", activitySchema);
