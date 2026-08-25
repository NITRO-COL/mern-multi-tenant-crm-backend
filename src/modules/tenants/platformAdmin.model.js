import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";

/**
 * The SaaS operator's own login — deliberately a SEPARATE collection from User.
 *
 * Keeping platform staff out of the tenant-scoped User collection means a bug in
 * tenant code can never accidentally surface or authenticate a platform admin,
 * and a platform admin has no tenantId to leak CRM data through.
 */
const platformAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "A valid email is required"],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

platformAdminSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, env.BCRYPT_ROUNDS);
  next();
});

platformAdminSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

platformAdminSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export const PlatformAdmin = mongoose.model("PlatformAdmin", platformAdminSchema);
