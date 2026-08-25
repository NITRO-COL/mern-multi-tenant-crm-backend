import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { can } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./activity.controller.js";
import { createActivitySchema, deleteActivitySchema, listActivitiesSchema } from "./activity.validation.js";

const router = Router();
router.use(authenticate);

router.post("/", can("activity:create"), validate(createActivitySchema), controller.create);

// :recordId accepts a lead OR a customer id — resolved (tenant-scoped) in the service.
router.get("/:recordId", can("activity:read"), validate(listActivitiesSchema), controller.listForRecord);

router.delete("/:id", can("activity:delete"), validate(deleteActivitySchema), controller.remove);

export default router;
