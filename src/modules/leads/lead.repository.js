import { Lead } from "./lead.model.js";
import { buildSearchRegex } from "../../shared/sanitize.js";
import { scopedPopulate } from "../../shared/populate.js";

/**
 * Tenant isolation — Layer 2.
 *
 * Every function here takes `tenantId` as its FIRST argument and folds it into
 * the query filter. Nothing above this layer touches the Lead model directly, so
 * an un-scoped read or write is not something a caller can express.
 */

const LIST_PROJECTION = "name email phone company status source assignedTo createdAt updatedAt convertedCustomerId";
const SORTABLE = new Set(["name", "email", "company", "status", "source", "createdAt", "updatedAt"]);

/** Whitelist the sort field — an arbitrary string here would let a client sort by an unindexed field. */
function buildSort(sortBy, sortOrder) {
  const field = SORTABLE.has(sortBy) ? sortBy : "createdAt";
  const dir = sortOrder === "asc" ? 1 : -1;
  // Tiebreaker keeps pagination stable when many rows share a sort value.
  return field === "createdAt" ? { createdAt: dir, _id: dir } : { [field]: dir, createdAt: -1 };
}

function buildFilter(tenantId, { search, status, source, assignedTo }) {
  const filter = { tenantId };

  if (status) filter.status = status;
  if (source) filter.source = source;
  if (assignedTo) filter.assignedTo = assignedTo;

  const regex = buildSearchRegex(search, { minLength: 1 });
  if (regex) {
    filter.$or = [
      { name: regex },
      { email: regex },
      { company: regex },
      { phone: regex },
    ];
  }

  return filter;
}

export async function list(tenantId, { page, limit, search, status, source, assignedTo, sortBy, sortOrder }) {
  const filter = buildFilter(tenantId, { search, status, source, assignedTo });
  const skip = (page - 1) * limit;

  // Count and page run concurrently — they are independent queries.
  const [items, total] = await Promise.all([
    Lead.find(filter)
      .select(LIST_PROJECTION)
      .populate(scopedPopulate(tenantId, "assignedTo", "name email"))
      .sort(buildSort(sortBy, sortOrder))
      .skip(skip)
      .limit(limit)
      .lean(),
    Lead.countDocuments(filter),
  ]);

  return { items, total };
}

export function findById(tenantId, id) {
  return Lead.findOne({ _id: id, tenantId })
    .populate(scopedPopulate(tenantId, "assignedTo", "name email"))
    .populate(scopedPopulate(tenantId, "createdBy", "name email"))
    .lean();
}

export function findByEmail(tenantId, email) {
  return Lead.findOne({ tenantId, email }).lean();
}

export function create(tenantId, data) {
  return Lead.create({ ...data, tenantId });
}

export function update(tenantId, id, data) {
  return Lead.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: data },
    { new: true, runValidators: true }
  )
    .populate(scopedPopulate(tenantId, "assignedTo", "name email"))
    .lean();
}

export function remove(tenantId, id) {
  return Lead.findOneAndDelete({ _id: id, tenantId }).lean();
}

export function countByTenant(tenantId, extra = {}) {
  return Lead.countDocuments({ tenantId, ...extra });
}
