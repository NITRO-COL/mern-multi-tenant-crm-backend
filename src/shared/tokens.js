import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Two token audiences, deliberately non-interchangeable.
 *
 * A tenant token always carries `tid`; a platform token never does. Because the
 * audience is verified, a platform admin's token cannot be replayed against a
 * tenant CRM route (or vice versa) even though both are signed by the same key.
 */
export const AUDIENCE = {
  TENANT: "crm:tenant",
  PLATFORM: "crm:platform",
};

export function signTenantToken({ userId, tenantId, role }) {
  return jwt.sign(
    { sub: String(userId), tid: String(tenantId), role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, audience: AUDIENCE.TENANT, issuer: "morsh-crm" }
  );
}

export function signPlatformToken({ adminId, role }) {
  return jwt.sign(
    { sub: String(adminId), role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, audience: AUDIENCE.PLATFORM, issuer: "morsh-crm" }
  );
}

export function verifyToken(token, audience) {
  return jwt.verify(token, env.JWT_SECRET, { audience, issuer: "morsh-crm" });
}

/** Pull a bearer token out of the Authorization header. */
export function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length ? token : null;
}
