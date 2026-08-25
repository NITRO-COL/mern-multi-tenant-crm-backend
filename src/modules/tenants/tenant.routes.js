import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { created, ok } from "../../shared/ApiResponse.js";
import { authenticatePlatform } from "../../middleware/authenticate.js";
import { can } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { email, idParam, requiredString } from "../../shared/validators.js";
import * as tenantService from "./tenant.service.js";

const router = Router();

// Platform audience only — a tenant user's token is rejected here by design.
router.use(authenticatePlatform);

const createTenantSchema = {
  body: z
    .object({
      name: requiredString("Tenant name", 120),
      slug: z.string().trim().toLowerCase().min(2).max(60)
        .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens"),
      admin: z.object({
        name: requiredString("Admin name", 120),
        email,
        password: z.string().min(8, "Password must be at least 8 characters").max(200),
      }),
    })
    .strip(),
};

const statusSchema = {
  params: idParam,
  body: z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }).strip(),
};

router.get("/tenants", can("tenant:read"), asyncHandler(async (_req, res) => {
  ok(res, await tenantService.listTenants());
}));

router.post("/tenants", can("tenant:create"), validate(createTenantSchema), asyncHandler(async (req, res) => {
  created(res, await tenantService.createTenant(req.body));
}));

router.patch("/tenants/:id/status", can("tenant:update"), validate(statusSchema), asyncHandler(async (req, res) => {
  ok(res, await tenantService.setTenantStatus(req.params.id, req.body.status));
}));

export default router;
