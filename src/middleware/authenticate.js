import mongoose from "mongoose";
import { ApiError } from "../shared/ApiError.js";
import { asyncHandler } from "../shared/asyncHandler.js";
import { AUDIENCE, extractBearerToken, verifyToken } from "../shared/tokens.js";
import { User } from "../modules/users/user.model.js";
import { Tenant } from "../modules/tenants/tenant.model.js";
import { PlatformAdmin } from "../modules/tenants/platformAdmin.model.js";
import { ROLES } from "../config/permissions.js";

/**
 * Tenant isolation — Layer 1.
 *
 * req.tenantId is derived HERE, from the verified JWT, and nowhere else. No
 * downstream code reads a tenantId out of req.body, req.query or req.params;
 * a client-supplied tenantId is stripped rather than trusted.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw ApiError.unauthorized("Authentication token is missing");

  let payload;
  try {
    payload = verifyToken(token, AUDIENCE.TENANT);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === "TokenExpiredError" ? "Session expired, please log in again" : "Invalid authentication token"
    );
  }

  if (!payload.tid || !mongoose.isValidObjectId(payload.tid)) {
    throw ApiError.unauthorized("Invalid authentication token");
  }

  const user = await User.findOne({ _id: payload.sub, tenantId: payload.tid }).lean();
  if (!user || !user.isActive) throw ApiError.unauthorized("User account is no longer active");

  const tenant = await Tenant.findById(payload.tid).lean();
  if (!tenant || tenant.status !== "ACTIVE") {
    throw ApiError.forbidden("This organization is not active");
  }

  req.user = { id: String(user._id), name: user.name, email: user.email, role: user.role };
  req.tenantId = String(user.tenantId); // single source of truth for the request
  req.tenant = { id: String(tenant._id), name: tenant.name, slug: tenant.slug };

  next();
});

/** Guards the platform-operator routes. These tokens carry no tenantId at all. */
export const authenticatePlatform = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw ApiError.unauthorized("Authentication token is missing");

  let payload;
  try {
    payload = verifyToken(token, AUDIENCE.PLATFORM);
  } catch {
    throw ApiError.unauthorized("Invalid authentication token");
  }

  const admin = await PlatformAdmin.findById(payload.sub).lean();
  if (!admin || !admin.isActive) throw ApiError.unauthorized("Admin account is no longer active");

  req.user = { id: String(admin._id), name: admin.name, email: admin.email, role: ROLES.SUPER_ADMIN };
  next();
});
