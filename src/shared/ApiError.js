/**
 * Operational error carrying an HTTP status and a stable machine-readable code.
 * Anything thrown that is NOT an ApiError is treated as an unexpected bug and
 * reported as a generic 500 — never leaking internals to the client.
 */
export class ApiError extends Error {
  constructor(statusCode, message, code, details) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code ?? defaultCode(statusCode);
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = "Invalid request", details) {
    return new ApiError(400, message, "BAD_REQUEST", details);
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message, "UNAUTHORIZED");
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new ApiError(403, message, "FORBIDDEN");
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, message, "NOT_FOUND");
  }
  static conflict(message = "Resource already exists", details) {
    return new ApiError(409, message, "CONFLICT", details);
  }
  static validation(message = "Validation failed", details) {
    return new ApiError(400, message, "VALIDATION_ERROR", details);
  }
  static internal(message = "Something went wrong") {
    return new ApiError(500, message, "INTERNAL_ERROR");
  }
}

function defaultCode(status) {
  return {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE",
    429: "RATE_LIMITED",
  }[status] ?? "INTERNAL_ERROR";
}
