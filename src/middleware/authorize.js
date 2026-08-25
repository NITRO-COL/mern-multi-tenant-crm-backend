import { ApiError } from "../shared/ApiError.js";
import { hasPermission } from "../config/permissions.js";

/**
 * Declarative RBAC guard, applied at the route definition:
 *   router.delete("/:id", authenticate, can("lead:delete"), controller.remove)
 *
 * Permission checks live in one table (config/permissions.js) rather than as
 * scattered role comparisons, so adding a role is a one-line change.
 */
export const can = (permission) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());

  if (!hasPermission(req.user.role, permission)) {
    return next(
      ApiError.forbidden(
        `Your role (${req.user.role}) is not permitted to perform this action`
      )
    );
  }
  next();
};

/** Occasionally simpler to read than a permission string. */
export const hasRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  next();
};
