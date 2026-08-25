import mongoose from "mongoose";
import { tenantPlugin } from "../../shared/tenantPlugin.js";

export const CUSTOMER_STATUSES = ["ACTIVE", "INACTIVE", "CHURNED"];

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Customer name is required"], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "A valid email is required"],
    },
    phone: { type: String, required: [true, "Phone is required"], trim: true, maxlength: 20 },
    company: { type: String, required: [true, "Company is required"], trim: true, maxlength: 160 },
    status: { type: String, enum: CUSTOMER_STATUSES, default: "ACTIVE", required: true },

    /** Account owner within the tenant. */
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    /** Provenance: which lead was promoted into this customer, if any. */
    convertedFromLeadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },

    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

customerSchema.plugin(tenantPlugin);

customerSchema.index({ tenantId: 1, createdAt: -1 });
customerSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
customerSchema.index({ tenantId: 1, owner: 1, createdAt: -1 });
customerSchema.index({ tenantId: 1, email: 1 }, { unique: true });
customerSchema.index({ tenantId: 1, name: 1 });

export const Customer = mongoose.model("Customer", customerSchema);
