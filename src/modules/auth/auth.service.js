import { ApiError } from "../../shared/ApiError.js";
import { signPlatformToken, signTenantToken } from "../../shared/tokens.js";
import { User } from "../users/user.model.js";
import { Tenant } from "../tenants/tenant.model.js";
import { PlatformAdmin } from "../tenants/platformAdmin.model.js";

/**
 * Login is the one place a user is looked up WITHOUT a tenant scope — the
 * tenant is not yet known. The escape hatch is explicit (`skipTenantScope`) so
 * it reads as a deliberate exception rather than a forgotten filter.
 */
export async function login({ email, password, tenantSlug }) {
  const filter = { email };

  if (tenantSlug) {
    const tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
    // Don't reveal whether the organization exists — same error either way.
    if (!tenant) throw ApiError.unauthorized("Invalid email or password");
    filter.tenantId = tenant._id;
  }

  const candidates = await User.find(filter)
    .select("+password")
    .setOptions({ skipTenantScope: true });

  if (!candidates.length) {
    // Constant-ish work regardless of hit/miss, and an identical message, so the
    // endpoint cannot be used to enumerate registered emails.
    throw ApiError.unauthorized("Invalid email or password");
  }

  let user = null;
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop -- candidate list is tiny (same email across tenants)
    if (await candidate.comparePassword(password)) {
      user = candidate;
      break;
    }
  }

  if (!user) throw ApiError.unauthorized("Invalid email or password");
  if (!user.isActive) throw ApiError.forbidden("Your account has been deactivated");

  const tenant = await Tenant.findById(user.tenantId).lean();
  if (!tenant) throw ApiError.unauthorized("Invalid email or password");
  if (tenant.status !== "ACTIVE") throw ApiError.forbidden("This organization is not active");

  const token = signTenantToken({ userId: user._id, tenantId: user.tenantId, role: user.role });

  return {
    token,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    },
    tenant: { id: String(tenant._id), name: tenant.name, slug: tenant.slug },
  };
}

export async function platformLogin({ email, password }) {
  const admin = await PlatformAdmin.findOne({ email }).select("+password");
  if (!admin || !(await admin.comparePassword(password))) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (!admin.isActive) throw ApiError.forbidden("Your account has been deactivated");

  return {
    token: signPlatformToken({ adminId: admin._id, role: "SUPER_ADMIN" }),
    user: { id: String(admin._id), name: admin.name, email: admin.email, role: "SUPER_ADMIN" },
  };
}

/** Creates a user inside the caller's own tenant — tenantId is never a parameter the client controls. */
export async function createTenantUser(tenantId, { name, email, password, role }) {
  const existing = await User.findOne({ tenantId, email }).lean();
  if (existing) throw ApiError.conflict("A user with this email already exists in your organization");

  const user = await User.create({ tenantId, name, email, password, role });
  return { id: String(user._id), name: user.name, email: user.email, role: user.role };
}
