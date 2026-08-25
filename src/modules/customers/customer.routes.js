import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { can } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as controller from "./customer.controller.js";
import {
  createCustomerSchema, deleteCustomerSchema, getCustomerSchema,
  listCustomersSchema, updateCustomerSchema,
} from "./customer.validation.js";

const router = Router();
router.use(authenticate);

router.get("/",       can("customer:read"),   validate(listCustomersSchema),  controller.list);
router.post("/",      can("customer:create"), validate(createCustomerSchema), controller.create);
router.get("/:id",    can("customer:read"),   validate(getCustomerSchema),    controller.getOne);
router.put("/:id",    can("customer:update"), validate(updateCustomerSchema), controller.update);
router.delete("/:id", can("customer:delete"), validate(deleteCustomerSchema), controller.remove);

export default router;
