import { asyncHandler } from "../../shared/asyncHandler.js";
import { created, ok } from "../../shared/ApiResponse.js";
import * as authService from "./auth.service.js";

/**
 * Controllers only translate HTTP <-> service calls. No business rules, no
 * database access — that keeps the service layer reusable and unit-testable
 * without an HTTP server.
 */
export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  ok(res, result);
});

export const platformLogin = asyncHandler(async (req, res) => {
  const result = await authService.platformLogin(req.body);
  ok(res, result);
});

export const me = asyncHandler(async (req, res) => {
  ok(res, { user: req.user, tenant: req.tenant });
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await authService.createTenantUser(req.tenantId, req.body);
  created(res, user);
});
