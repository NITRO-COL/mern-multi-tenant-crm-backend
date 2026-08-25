import { Activity } from "./activity.model.js";
import { scopedPopulate } from "../../shared/populate.js";

/** Tenant isolation — Layer 2. */

export async function listByRecord(tenantId, { leadId, customerId, page, limit }) {
  const filter = { tenantId };
  if (leadId) filter.leadId = leadId;
  if (customerId) filter.customerId = customerId;

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Activity.find(filter)
      .populate(scopedPopulate(tenantId, "createdBy", "name email"))
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Activity.countDocuments(filter),
  ]);

  return { items, total };
}

export function findById(tenantId, id) {
  return Activity.findOne({ _id: id, tenantId })
    .populate(scopedPopulate(tenantId, "createdBy", "name email"))
    .lean();
}

export function create(tenantId, data) {
  return Activity.create({ ...data, tenantId });
}

export function remove(tenantId, id) {
  return Activity.findOneAndDelete({ _id: id, tenantId }).lean();
}

/** Used when a parent lead/customer is deleted, so no orphans linger. */
export function removeByRecord(tenantId, { leadId, customerId }) {
  const filter = { tenantId };
  if (leadId) filter.leadId = leadId;
  if (customerId) filter.customerId = customerId;
  return Activity.deleteMany(filter);
}
