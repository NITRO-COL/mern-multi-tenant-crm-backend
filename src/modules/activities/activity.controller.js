import { asyncHandler } from "../../shared/asyncHandler.js";
import { created, noContent, ok, paginationMeta } from "../../shared/ApiResponse.js";
import * as activityService from "./activity.service.js";

export const create = asyncHandler(async (req, res) => {
  created(res, await activityService.createActivity(req.tenantId, req.user.id, req.body));
});

export const listForRecord = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const { items, total } = await activityService.listForRecord(req.tenantId, req.params.recordId, { page, limit });
  ok(res, items, paginationMeta({ page, limit, total }));
});

export const remove = asyncHandler(async (req, res) => {
  await activityService.deleteActivity(req.tenantId, req.params.id);
  noContent(res);
});
