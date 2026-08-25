import { Router } from "express";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { ok } from "../../shared/ApiResponse.js";
import { authenticate } from "../../middleware/authenticate.js";
import { can } from "../../middleware/authorize.js";
import { User } from "./user.model.js";

const router = Router();
router.use(authenticate);

/**
 * Colleagues within the caller's own tenant — powers the "Assign to" pickers.
 * Scoped to req.tenantId, so it can never enumerate users of another org.
 */
router.get(
  "/",
  can("lead:read"),
  asyncHandler(async (req, res) => {
    const users = await User.find({ tenantId: req.tenantId, isActive: true })
      .select("name email role")
      .sort({ name: 1 })
      .lean();
    ok(res, users);
  })
);

export default router;
