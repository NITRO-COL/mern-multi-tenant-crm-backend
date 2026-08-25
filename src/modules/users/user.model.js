import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { tenantPlugin } from "../../shared/tenantPlugin.js";
import { TENANT_ROLES, ROLES } from "../../config/permissions.js";
import { env } from "../../config/env.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "A valid email is required"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false, // never returned unless explicitly requested
    },
    role: { type: String, enum: TENANT_ROLES, default: ROLES.SALES, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.plugin(tenantPlugin);

/**
 * Email is unique WITHIN a tenant, not globally — two different organizations
 * may legitimately employ the same person / shared address.
 */
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1 });

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, env.BCRYPT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Defence in depth: strip the hash even if a query forgets to deselect it. */
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model("User", userSchema);
