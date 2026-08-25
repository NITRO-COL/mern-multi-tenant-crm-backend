import { Customer } from "./customer.model.js";
import { buildSearchRegex } from "../../shared/sanitize.js";
import { scopedPopulate } from "../../shared/populate.js";

/** Tenant isolation — Layer 2. tenantId is the mandatory first argument. */

const LIST_PROJECTION = "name email phone company status owner convertedFromLeadId createdAt updatedAt";
const SORTABLE = new Set(["name", "email", "company", "status", "createdAt", "updatedAt"]);

function buildSort(sortBy, sortOrder) {
  const field = SORTABLE.has(sortBy) ? sortBy : "createdAt";
  const dir = sortOrder === "asc" ? 1 : -1;
  return field === "createdAt" ? { createdAt: dir, _id: dir } : { [field]: dir, createdAt: -1 };
}

function buildFilter(tenantId, { search, status, owner }) {
  const filter = { tenantId };
  if (status) filter.status = status;
  if (owner) filter.owner = owner;

  const regex = buildSearchRegex(search, { minLength: 1 });
  if (regex) {
    filter.$or = [{ name: regex }, { email: regex }, { company: regex }, { phone: regex }];
  }
  return filter;
}

export async function list(tenantId, { page, limit, search, status, owner, sortBy, sortOrder }) {
  const filter = buildFilter(tenantId, { search, status, owner });
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Customer.find(filter)
      .select(LIST_PROJECTION)
      .populate(scopedPopulate(tenantId, "owner", "name email"))
      .sort(buildSort(sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    Customer.countDocuments(filter),
  ]);

  return { items, total };
}

export function findById(tenantId, id) {
  return Customer.findOne({ _id: id, tenantId })
    .populate(scopedPopulate(tenantId, "owner", "name email"))
    .populate(scopedPopulate(tenantId, "createdBy", "name email"))
    .lean();
}

export function findByEmail(tenantId, email) {
  return Customer.findOne({ tenantId, email }).lean();
}

export function create(tenantId, data) {
  return Customer.create({ ...data, tenantId });
}

export function update(tenantId, id, data) {
  return Customer.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: data },
    { new: true, runValidators: true }
  )
    .populate(scopedPopulate(tenantId, "owner", "name email"))
    .lean();
}

export function remove(tenantId, id) {
  return Customer.findOneAndDelete({ _id: id, tenantId }).lean();
}

export function countByTenant(tenantId, extra = {}) {
  return Customer.countDocuments({ tenantId, ...extra });
}
