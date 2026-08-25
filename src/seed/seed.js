import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { logger } from "../shared/logger.js";

import { Tenant } from "../modules/tenants/tenant.model.js";
import { PlatformAdmin } from "../modules/tenants/platformAdmin.model.js";
import { User } from "../modules/users/user.model.js";
import { Lead } from "../modules/leads/lead.model.js";
import { Customer } from "../modules/customers/customer.model.js";
import { Activity } from "../modules/activities/activity.model.js";

import { PLATFORM_ADMIN, TENANTS, buildLeads, buildActivities } from "./data.js";

/**
 * Seeds two fully populated, mutually isolated organizations plus one platform
 * admin. Re-running wipes and rebuilds, so the credentials in the README are
 * always exactly what is in the database.
 */
export async function seed({ verbose = true } = {}) {
  const log = verbose ? logger.info : () => {};

  log("Clearing existing data…");
  await Promise.all([
    Activity.deleteMany({}).setOptions({ skipTenantScope: true }),
    Lead.deleteMany({}).setOptions({ skipTenantScope: true }),
    Customer.deleteMany({}).setOptions({ skipTenantScope: true }),
    User.deleteMany({}).setOptions({ skipTenantScope: true }),
    Tenant.deleteMany({}),
    PlatformAdmin.deleteMany({}),
  ]);

  await PlatformAdmin.create(PLATFORM_ADMIN);
  log(`Platform admin: ${PLATFORM_ADMIN.email}`);

  const summary = [];

  for (const spec of TENANTS) {
    const tenant = await Tenant.create({ name: spec.name, slug: spec.slug });

    // `User.create` hashes each password via the pre-save hook — a bulk
    // insertMany would bypass it and store plaintext.
    const users = [];
    for (const u of spec.users) {
      users.push(await User.create({ ...u, tenantId: tenant._id }));
    }
    const userIds = users.map((u) => u._id);

    const leadDocs = buildLeads(spec, userIds).map((l) => ({ ...l, tenantId: tenant._id }));
    const leads = await Lead.insertMany(leadDocs);

    // Every CONVERTED lead gets a matching customer, mirroring the app's own
    // conversion flow so the two modules stay consistent.
    const convertedLeads = leads.filter((l) => l.status === "CONVERTED");
    const customers = await Customer.insertMany(
      convertedLeads.map((lead, i) => ({
        tenantId: tenant._id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        status: ["ACTIVE", "ACTIVE", "INACTIVE", "CHURNED"][i % 4],
        owner: lead.assignedTo,
        convertedFromLeadId: lead._id,
        notes: "Converted from lead during onboarding.",
        createdBy: userIds[0],
        createdAt: lead.createdAt,
      }))
    );

    for (let i = 0; i < convertedLeads.length; i += 1) {
      await Lead.updateOne(
        { _id: convertedLeads[i]._id, tenantId: tenant._id },
        { $set: { convertedCustomerId: customers[i]._id, convertedAt: customers[i].createdAt } }
      );
    }

    const activityDocs = buildActivities(spec, leads, userIds)
      .map((a) => ({ ...a, tenantId: tenant._id }));
    const activities = await Activity.insertMany(activityDocs);

    summary.push({
      tenant: `${spec.name} (${spec.slug})`,
      users: users.length,
      leads: leads.length,
      customers: customers.length,
      activities: activities.length,
    });

    log(`Seeded ${spec.name}: ${leads.length} leads, ${customers.length} customers, ${activities.length} activities`);
  }

  // Build the compound indexes now rather than on first production query.
  await Promise.all([
    Lead.syncIndexes(), Customer.syncIndexes(),
    Activity.syncIndexes(), User.syncIndexes(), Tenant.syncIndexes(),
  ]);
  log("Indexes synced");

  return summary;
}

/** Run directly (`npm run seed`) rather than imported by a test. */
const isDirectRun = process.argv[1]?.endsWith("seed.js");

if (isDirectRun) {
  connectDatabase()
    .then(() => seed())
    .then((summary) => {
      console.log("\n" + "─".repeat(64));
      console.log("  SEED COMPLETE — test credentials");
      console.log("─".repeat(64));
      console.table(summary);
      console.log("\n  Platform admin (POST /api/auth/platform/login)");
      console.log(`    ${PLATFORM_ADMIN.email} / ${PLATFORM_ADMIN.password}\n`);
      for (const t of TENANTS) {
        console.log(`  ${t.name}  [slug: ${t.slug}]`);
        for (const u of t.users) console.log(`    ${u.role.padEnd(6)}  ${u.email} / ${u.password}`);
        console.log("");
      }
      console.log("─".repeat(64) + "\n");
      return disconnectDatabase();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("Seed failed", err);
      mongoose.connection.close().finally(() => process.exit(1));
    });
}
