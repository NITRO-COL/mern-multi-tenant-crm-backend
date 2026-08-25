import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { can } from "../../middleware/authorize.js";
import { env } from "../../config/env.js";
import * as controller from "./auth.controller.js";
import { loginSchema, platformLoginSchema, registerTenantUserSchema } from "./auth.validation.js";

const router = Router();

/**
 * Credential endpoints get a tighter budget than the rest of the API.
 *
 * Only FAILED attempts count toward the limit — that is what brute-force
 * protection is actually guarding against. Counting successful logins too would
 * lock out legitimate users who switch accounts often (reviewers testing tenant
 * isolation across four logins, for one) without making guessing any harder.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 15,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many failed login attempts. Please try again in a few minutes." },
  },
});

router.post("/login", loginLimiter, validate(loginSchema), controller.login);
router.post("/platform/login", loginLimiter, validate(platformLoginSchema), controller.platformLogin);

router.get("/me", authenticate, controller.me);
router.post("/users", authenticate, can("user:manage"), validate(registerTenantUserSchema), controller.createUser);

export default router;
