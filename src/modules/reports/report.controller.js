import { asyncHandler } from "../../shared/asyncHandler.js";
import { ok } from "../../shared/ApiResponse.js";
import * as reportService from "./report.service.js";

export const dashboard = asyncHandler(async (req, res) => {
  ok(res, await reportService.getDashboard(req.tenantId));
});
