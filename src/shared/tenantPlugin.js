import mongoose from "mongoose";
import { logger } from "./logger.js";

/**
 * Tenant isolation — Layer 3 (the safety net).
 *
 * Layer 1 derives tenantId from the JWT.
 * Layer 2 makes tenantId the mandatory first argument of every repository call.
 * Layer 3 (this plugin) refuses to execute any query that somehow reached the
 *         driver without a tenantId filter.
 *
 * The point is that forgetting the scope becomes a loud, immediate failure in
 * development and tests, rather than a silent cross-tenant data leak in
 * production. Security by construction, not by discipline.
 *
 * Deliberate unscoped access (login by email, seeding, platform admin) must opt
 * out explicitly via `.setOptions({ skipTenantScope: true })`.
 */

// Read/write query methods that must always be tenant-filtered.
const GUARDED_QUERY_OPS = [
  "count",
  "countDocuments",
  "deleteMany",
  "deleteOne",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "updateMany",
  "updateOne",
  "distinct",
];

export function tenantPlugin(schema, options = {}) {
  const { index = true } = options;

  schema.add({
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: [true, "tenantId is required"],
      index,
      immutable: true, // a record can never be moved between tenants
    },
  });

  schema.pre(GUARDED_QUERY_OPS, function guardQuery() {
    if (this.getOptions().skipTenantScope) return;

    const filter = this.getFilter() ?? {};
    if (filter.tenantId === undefined || filter.tenantId === null) {
      throw buildViolation(
        `${this.model.modelName}.${this.op}() executed without a tenantId filter`
      );
    }
  });

  schema.pre("aggregate", function guardAggregate() {
    if (this.options?.skipTenantScope) return;

    const [firstStage] = this.pipeline();
    const matchesTenant =
      firstStage &&
      Object.prototype.hasOwnProperty.call(firstStage, "$match") &&
      firstStage.$match.tenantId !== undefined;

    if (!matchesTenant) {
      throw buildViolation(
        `${this._model.modelName}.aggregate() must begin with a $match on tenantId`
      );
    }
  });

  /**
   * Documents are created through `new Model()` / `.create()`, which bypass
   * query middleware — the required+immutable field above covers that path.
   * This hook simply makes the failure message consistent.
   */
  schema.pre("save", function guardSave(next) {
    if (this.isNew && !this.tenantId) {
      return next(buildViolation(`${this.constructor.modelName} saved without a tenantId`));
    }
    next();
  });
}

function buildViolation(message) {
  const err = new Error(`[TENANT-ISOLATION] ${message}`);
  err.name = "TenantScopeViolation";
  err.statusCode = 500;
  logger.error(err.message);
  return err;
}
