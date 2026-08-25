import { asyncHandler } from "../../shared/asyncHandler.js";
import { created, noContent, ok, paginationMeta } from "../../shared/ApiResponse.js";
import * as leadService from "./lead.service.js";

export const list = asyncHandler(async (req, res) => {
  const { items, total } = await leadService.listLeads(req.tenantId, req.query);
  ok(res, items, paginationMeta({ page: req.query.page, limit: req.query.limit, total }));
});

export const getOne = asyncHandler(async (req, res) => {
  ok(res, await leadService.getLead(req.tenantId, req.params.id));
});

export const create = asyncHandler(async (req, res) => {
  created(res, await leadService.createLead(req.tenantId, req.user.id, req.body));
});

export const update = asyncHandler(async (req, res) => {
  ok(res, await leadService.updateLead(req.tenantId, req.params.id, req.body));
});

export const remove = asyncHandler(async (req, res) => {
  await leadService.deleteLead(req.tenantId, req.params.id);
  noContent(res);
});

export const convert = asyncHandler(async (req, res) => {
  const customer = await leadService.convertLead(req.tenantId, req.params.id, req.user.id, req.body);
  created(res, customer);
});
