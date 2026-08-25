import { asyncHandler } from "../../shared/asyncHandler.js";
import { created, noContent, ok, paginationMeta } from "../../shared/ApiResponse.js";
import * as customerService from "./customer.service.js";

export const list = asyncHandler(async (req, res) => {
  const { items, total } = await customerService.listCustomers(req.tenantId, req.query);
  ok(res, items, paginationMeta({ page: req.query.page, limit: req.query.limit, total }));
});

export const getOne = asyncHandler(async (req, res) => {
  ok(res, await customerService.getCustomer(req.tenantId, req.params.id));
});

export const create = asyncHandler(async (req, res) => {
  created(res, await customerService.createCustomer(req.tenantId, req.user.id, req.body));
});

export const update = asyncHandler(async (req, res) => {
  ok(res, await customerService.updateCustomer(req.tenantId, req.params.id, req.body));
});

export const remove = asyncHandler(async (req, res) => {
  await customerService.deleteCustomer(req.tenantId, req.params.id);
  noContent(res);
});
