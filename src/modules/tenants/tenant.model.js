import mongoose from "mongoose";

/**
 * An organization on the platform. Every CRM record ultimately hangs off one of
 * these. Tenants themselves are NOT tenant-scoped (they are the scope), so this
 * schema deliberately does not use tenantPlugin.
 */
const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tenant name is required"],
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: [true, "Tenant slug is required"],
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens"],
      maxlength: 60,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
      index: true,
    },
    /**
     * Reserved for zero-downtime migrations: schema changes roll out tenant by
     * tenant, so a failed migration blasts one organization instead of all.
     */
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const Tenant = mongoose.model("Tenant", tenantSchema);
