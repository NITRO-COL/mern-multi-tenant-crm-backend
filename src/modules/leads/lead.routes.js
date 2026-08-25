import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { can } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./lead.controller.js";
import {
  convertLeadSchema, createLeadSchema, deleteLeadSchema,
  getLeadSchema, listLeadsSchema, updateLeadSchema,
} from "./lead.validation.js";

const router = Router();

// Every route below is authenticated; tenantId is attached by `authenticate`.
router.use(authenticate);

router.get("/",          can("lead:read"),   validate(listLeadsSchema),  controller.list);
router.post("/",         can("lead:create"), validate(createLeadSchema), controller.create);
router.get("/:id",       can("lead:read"),   validate(getLeadSchema),    controller.getOne);
router.put("/:id",       can("lead:update"), validate(updateLeadSchema), controller.update);

// SALES holds no "lead:delete" permission — this returns 403 for them.
router.delete("/:id",    can("lead:delete"), validate(deleteLeadSchema), controller.remove);

router.post("/:id/convert", can("customer:create"), validate(convertLeadSchema), controller.convert);

export default router;
