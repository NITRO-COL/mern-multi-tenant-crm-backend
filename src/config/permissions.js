/**
 * Role-Based Access Control.
 *
 * Permissions are strings shaped "<resource>:<action>". A role may hold a
 * wildcard ("lead:*") to cover every action on a resource.
 *
 * Adding a role is a single entry here — no scattered `if (role === ...)` checks.
 */
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN", // platform operator — no tenant, no CRM data access
  ADMIN: "ADMIN",             // tenant owner/manager — full CRM access incl. delete
  SALES: "SALES",             // tenant sales rep — read/create/update, NO delete
};

export const TENANT_ROLES = [ROLES.ADMIN, ROLES.SALES];

const PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ["tenant:*", "platform:*"],

  [ROLES.ADMIN]: [
    "lead:*",
    "customer:*",
    "activity:*",
    "report:read",
    "user:manage",
  ],

  [ROLES.SALES]: [
    "lead:read", "lead:create", "lead:update",
    "customer:read", "customer:create", "customer:update",
    "activity:read", "activity:create",
    "report:read",
  ],
};

/**
 * Does `role` hold `permission`?
 * Supports exact match ("lead:delete") and resource wildcard ("lead:*").
 */
export function hasPermission(role, permission) {
  const granted = PERMISSIONS[role];
  if (!granted) return false;
  if (granted.includes(permission)) return true;

  const [resource] = permission.split(":");
  return granted.includes(`${resource}:*`);
}

export { PERMISSIONS };
