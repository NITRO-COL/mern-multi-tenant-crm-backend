import { ApiError } from "../../shared/ApiError.js";
import * as leadRepo from "./lead.repository.js";
import * as customerRepo from "../customers/customer.repository.js";
import { User } from "../users/user.model.js";

/** Business rules live here. This layer knows nothing about HTTP. */

/** An assignee must be a real user *inside the same tenant* — not just any ObjectId. */
async function assertAssigneeInTenant(tenantId, userId) {
  if (!userId) return;
  const user = await User.findOne({ _id: userId, tenantId }).lean();
  if (!user) throw ApiError.badRequest("Assigned user does not belong to your organization");
}

export async function listLeads(tenantId, query) {
  const { items, total } = await leadRepo.list(tenantId, query);
  return { items, total };
}

export async function getLead(tenantId, id) {
  const lead = await leadRepo.findById(tenantId, id);
  // A lead belonging to another tenant is indistinguishable from one that does
  // not exist. Returning 403 here would confirm the record is real.
  if (!lead) throw ApiError.notFound("Lead not found");
  return lead;
}

export async function createLead(tenantId, userId, payload) {
  await assertAssigneeInTenant(tenantId, payload.assignedTo);

  const duplicate = await leadRepo.findByEmail(tenantId, payload.email);
  if (duplicate) throw ApiError.conflict("A lead with this email already exists");

  const lead = await leadRepo.create(tenantId, { ...payload, createdBy: userId });
  return leadRepo.findById(tenantId, lead._id);
}

export async function updateLead(tenantId, id, payload) {
  const existing = await leadRepo.findById(tenantId, id);
  if (!existing) throw ApiError.notFound("Lead not found");

  await assertAssigneeInTenant(tenantId, payload.assignedTo);

  if (payload.email && payload.email !== existing.email) {
    const duplicate = await leadRepo.findByEmail(tenantId, payload.email);
    if (duplicate) throw ApiError.conflict("A lead with this email already exists");
  }

  return leadRepo.update(tenantId, id, payload);
}

export async function deleteLead(tenantId, id) {
  const deleted = await leadRepo.remove(tenantId, id);
  if (!deleted) throw ApiError.notFound("Lead not found");
  return deleted;
}

/**
 * Promote a CONVERTED lead into the Customers module.
 *
 * The tenant relationship is preserved by construction: the customer is written
 * with the same tenantId the lead was read under, which itself came from the JWT.
 */
export async function convertLead(tenantId, id, userId, { owner, notes } = {}) {
  const lead = await leadRepo.findById(tenantId, id);
  if (!lead) throw ApiError.notFound("Lead not found");

  if (lead.convertedCustomerId) {
    throw ApiError.conflict("This lead has already been converted to a customer");
  }
  if (lead.status !== "CONVERTED") {
    throw ApiError.badRequest("Only leads with status CONVERTED can be converted to a customer");
  }

  const existingCustomer = await customerRepo.findByEmail(tenantId, lead.email);
  if (existingCustomer) throw ApiError.conflict("A customer with this email already exists");

  await assertAssigneeInTenant(tenantId, owner);

  const customer = await customerRepo.create(tenantId, {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    status: "ACTIVE",
    owner: owner ?? lead.assignedTo?._id ?? null,
    convertedFromLeadId: lead._id,
    notes: notes || lead.notes,
    createdBy: userId,
  });

  await leadRepo.update(tenantId, id, {
    convertedCustomerId: customer._id,
    convertedAt: new Date(),
  });

  return customerRepo.findById(tenantId, customer._id);
}
