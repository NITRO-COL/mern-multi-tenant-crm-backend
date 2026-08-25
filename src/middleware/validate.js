import { ApiError } from "../shared/ApiError.js";

/**
 * Zod-backed request validation.
 *
 * Two things happen here beyond type-checking:
 *  1. Validated values REPLACE req.body/query/params, so controllers receive
 *     coerced, trimmed data and never the raw client payload.
 *  2. Unknown keys are stripped by the schemas (they use .strip()), which is how
 *     a client-supplied `tenantId` gets discarded before it can reach a query.
 */
export const validate = (schemas) => (req, _res, next) => {
  const errors = [];

  for (const source of ["body", "query", "params"]) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source]);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          field: [source, ...issue.path].join("."),
          message: issue.message,
        });
      }
      continue;
    }

    // req.query is a getter on Express 5 / read-only in some setups — assign safely.
    try {
      req[source] = result.data;
    } catch {
      Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    }
  }

  if (errors.length) return next(ApiError.validation("Validation failed", errors));
  next();
};
