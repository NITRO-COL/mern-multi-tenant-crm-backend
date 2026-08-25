import mongoose from "mongoose";
import { tenantPlugin } from "../../shared/tenantPlugin.js";

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
export const LEAD_SOURCES = ["WEBSITE", "REFERRAL", "COLD_CALL", "EMAIL_CAMPAIGN", "SOCIAL_MEDIA", "EVENT", "OTHER"];

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Lead name is required"], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "A valid email is required"],
    },
    phone: { type: String, required: [true, "Phone is required"], trim: true, maxlength: 20 },
    company: { type: String, required: [true, "Company is required"], trim: true, maxlength: 160 },
    status: { type: String, enum: LEAD_STATUSES, default: "NEW", required: true },
    source: { type: String, enum: LEAD_SOURCES, default: "OTHER", required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },

    /** Set once the lead has been promoted into the Customers module. */
    convertedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    convertedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

leadSchema.plugin(tenantPlugin);

/**
 * Index strategy — every index leads with tenantId.
 *
 * tenantId is an equality match on literally every query, so putting it first
 * lets MongoDB seek straight to one organization's slice instead of scanning the
 * whole collection. Field order follows ESR: Equality, then Sort, then Range.
 */
leadSchema.index({ tenantId: 1, createdAt: -1 });               // default list + sort
leadSchema.index({ tenantId: 1, status: 1, createdAt: -1 });    // status filter + sort
leadSchema.index({ tenantId: 1, source: 1 });                   // source reporting
leadSchema.index({ tenantId: 1, assignedTo: 1, createdAt: -1 });// "my leads"
leadSchema.index({ tenantId: 1, email: 1 }, { unique: true });  // no duplicate lead per tenant
leadSchema.index({ tenantId: 1, name: 1 });                     // name sort / prefix search

export const Lead = mongoose.model("Lead", leadSchema);
