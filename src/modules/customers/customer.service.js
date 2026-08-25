import { ApiError } from "../../shared/ApiError.js";
import * as customerRepo from "./customer.repository.js";
import { User } from "../users/user.model.js";

async function assertOwnerInTenant(tenantId, userId) {
  if (!userId) return;
  const user = await User.findOne({ _id: userId, tenantId }).lean();
  if (!user) throw ApiError.badRequest("Owner does not belong to your organization");
}

export async function listCustomers(tenantId, query) {
  return customerRepo.list(tenantId, query);
}

export async function getCustomer(tenantId, id) {
  const customer = await customerRepo.findById(tenantId, id);
  if (!customer) throw ApiError.notFound("Customer not found");
  return customer;
}

export async function createCustomer(tenantId, userId, payload) {
  await assertOwnerInTenant(tenantId, payload.owner);

  const duplicate = await customerRepo.findByEmail(tenantId, payload.email);
  if (duplicate) throw ApiError.conflict("A customer with this email already exists");

  const customer = await customerRepo.create(tenantId, { ...payload, createdBy: userId });
  return customerRepo.findById(tenantId, customer._id);
}

export async function updateCustomer(tenantId, id, payload) {
  const existing = await customerRepo.findById(tenantId, id);
  if (!existing) throw ApiError.notFound("Customer not found");

  await assertOwnerInTenant(tenantId, payload.owner);

  if (payload.email && payload.email !== existing.email) {
    const duplicate = await customerRepo.findByEmail(tenantId, payload.email);
    if (duplicate) throw ApiError.conflict("A customer with this email already exists");
  }

  return customerRepo.update(tenantId, id, payload);
}

export async function deleteCustomer(tenantId, id) {
  const deleted = await customerRepo.remove(tenantId, id);
  if (!deleted) throw ApiError.notFound("Customer not found");
  return deleted;
}
