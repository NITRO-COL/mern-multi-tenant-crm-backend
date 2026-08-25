import { ApiError } from "../../shared/ApiError.js";
import * as activityRepo from "./activity.repository.js";
import * as leadRepo from "../leads/lead.repository.js";
import * as customerRepo from "../customers/customer.repository.js";

/**
 * Before writing or reading an activity we verify the PARENT record belongs to
 * the caller's tenant. Without this, a user could attach activities to — or read
 * activities off — another organization's lead by guessing its id.
 */
async function assertParentInTenant(tenantId, { leadId, customerId }) {
  if (leadId) {
    const lead = await leadRepo.findById(tenantId, leadId);
    if (!lead) throw ApiError.notFound("Lead not found");
    return;
  }
  const customer = await customerRepo.findById(tenantId, customerId);
  if (!customer) throw ApiError.notFound("Customer not found");
}

export async function createActivity(tenantId, userId, payload) {
  await assertParentInTenant(tenantId, payload);
  const activity = await activityRepo.create(tenantId, { ...payload, createdBy: userId });
  return activityRepo.findById(tenantId, activity._id);
}

/**
 * The record id may be either a lead or a customer — we resolve which, scoped to
 * the tenant, and 404 if it is neither.
 */
export async function listForRecord(tenantId, recordId, { page, limit }) {
  const lead = await leadRepo.findById(tenantId, recordId);
  if (lead) return activityRepo.listByRecord(tenantId, { leadId: recordId, page, limit });

  const customer = await customerRepo.findById(tenantId, recordId);
  if (customer) return activityRepo.listByRecord(tenantId, { customerId: recordId, page, limit });

  throw ApiError.notFound("Record not found");
}

export async function deleteActivity(tenantId, id) {
  const deleted = await activityRepo.remove(tenantId, id);
  if (!deleted) throw ApiError.notFound("Activity not found");
  return deleted;
}
