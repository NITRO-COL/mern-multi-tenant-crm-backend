import mongoose from "mongoose";
import { ApiError } from "../shared/ApiError.js";
import { logger } from "../shared/logger.js";
import { env } from "../config/env.js";

/** 404 for any route that did not match. */
export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

/**
 * Single exit point for every error.
 *
 * Known (operational) errors keep their status and message. Anything else is
 * logged in full server-side and reported to the client as a bare 500 — stack
 * traces, driver messages and config never cross the wire in production.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, _next) {
  let error = err;

  if (!(error instanceof ApiError)) error = normalize(err);

  if (error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${error.statusCode}`, err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${error.statusCode}: ${error.message}`);
  }

  const body = {
    success: false,
    error: {
      code: error.code,
      message: error.statusCode >= 500 && env.isProd ? "Something went wrong" : error.message,
    },
  };

  if (error.details) body.error.details = error.details;
  if (!env.isProd && error.statusCode >= 500) body.error.stack = err.stack;

  res.status(error.statusCode).json(body);
}

/** Translate framework/driver errors into ApiError. */
function normalize(err) {
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return ApiError.validation("Validation failed", details);
  }

  if (err instanceof mongoose.Error.CastError) {
    // A malformed ObjectId is treated as "not found", never as a server error —
    // and never echoed back, so probing IDs reveals nothing.
    return ApiError.notFound("Resource not found");
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {}).filter((k) => k !== "tenantId");
    return ApiError.conflict(
      field.length ? `A record with this ${field.join(", ")} already exists` : "Record already exists"
    );
  }

  if (err?.name === "TenantScopeViolation") {
    // A bug on our side, never the client's fault — surface nothing useful.
    return ApiError.internal();
  }

  if (err?.type === "entity.parse.failed") {
    return ApiError.badRequest("Request body is not valid JSON");
  }

  const apiErr = ApiError.internal();
  apiErr.statusCode = err?.statusCode ?? 500;
  return apiErr;
}
