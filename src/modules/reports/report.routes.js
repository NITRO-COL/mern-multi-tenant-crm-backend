import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { can } from "../../middleware/authorize.js";
import * as controller from "./report.controller.js";

const router = Router();
router.use(authenticate);

router.get("/dashboard", can("report:read"), controller.dashboard);

export default router;
