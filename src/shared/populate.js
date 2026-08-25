/**
 * Tenant-scoped populate.
 *
 * A plain `.populate("assignedTo")` issues `User.find({ _id: { $in: [...] } })`
 * with no tenant filter — a reference stored on a document would be resolved
 * against the entire collection. The `match` clause here re-applies the scope, so
 * a reference that points outside the tenant resolves to null instead of leaking
 * a foreign document.
 *
 * (This is not hypothetical: the tenantPlugin caught exactly this on the first
 * test run, which is the whole reason the plugin exists.)
 */
export function scopedPopulate(tenantId, path, select) {
  return { path, select, match: { tenantId } };
}
