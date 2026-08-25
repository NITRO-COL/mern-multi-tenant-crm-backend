import { ApiError } from "../../shared/ApiError.js";
import { Tenant } from "./tenant.model.js";
import { User } from "../users/user.model.js";
import { Lead } from "../leads/lead.model.js";
import { Customer } from "../customers/customer.model.js";

/**
 * Platform-operator operations. These deliberately live behind a separate token
 * audience and a separate route namespace (/api/platform), and they never return
 * CRM record contents — only counts. The operator manages organizations; they do
 * not get a backdoor into customer data.
 */

export async function listTenants() {
  const tenants = await Tenant.find().sort({ createdAt: -1 }).lean();

  // Counts are aggregated per tenant. Unscoped by necessity, hence the explicit
  // opt-out — this is the one context where cross-tenant reads are the point.
  const [userCounts, leadCounts, customerCounts] = await Promise.all([
    User.aggregate([{ $group: { _id: "$tenantId", count: { $sum: 1 } } }]).option({ skipTenantScope: true }),
    Lead.aggregate([{ $group: { _id: "$tenantId", count: { $sum: 1 } } }]).option({ skipTenantScope: true }),
    Customer.aggregate([{ $group: { _id: "$tenantId", count: { $sum: 1 } } }]).option({ skipTenantScope: true }),
  ]);

  const index = (rows) => new Map(rows.map((r) => [String(r._id), r.count]));
  const users = index(userCounts);
  const leads = index(leadCounts);
  const customers = index(customerCounts);

  return tenants.map((t) => ({
    id: String(t._id),
    name: t.name,
    slug: t.slug,
    status: t.status,
    schemaVersion: t.schemaVersion,
    createdAt: t.createdAt,
    counts: {
      users: users.get(String(t._id)) ?? 0,
      leads: leads.get(String(t._id)) ?? 0,
      customers: customers.get(String(t._id)) ?? 0,
    },
  }));
}

export async function createTenant({ name, slug, admin }) {
  const existing = await Tenant.findOne({ slug }).lean();
  if (existing) throw ApiError.conflict("A tenant with this slug already exists");

  const tenant = await Tenant.create({ name, slug });

  const adminUser = await User.create({
    tenantId: tenant._id,
    name: admin.name,
    email: admin.email,
    password: admin.password,
    role: "ADMIN",
  });

  return {
    tenant: { id: String(tenant._id), name: tenant.name, slug: tenant.slug, status: tenant.status },
    admin: { id: String(adminUser._id), name: adminUser.name, email: adminUser.email, role: adminUser.role },
  };
}

export async function setTenantStatus(id, status) {
  const tenant = await Tenant.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
  if (!tenant) throw ApiError.notFound("Tenant not found");
  return { id: String(tenant._id), name: tenant.name, slug: tenant.slug, status: tenant.status };
}
