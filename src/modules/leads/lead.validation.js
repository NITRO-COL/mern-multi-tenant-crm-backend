import { z } from "zod";
import { LEAD_SOURCES, LEAD_STATUSES } from "./lead.model.js";
import {
  email, idParam, nullableObjectId, optionalString,
  paginationQuery, phone, requiredString,
} from "../../shared/validators.js";

/**
 * `.strip()` on every body schema is load-bearing: it silently discards unknown
 * keys, which is what stops a client-supplied `tenantId`, `createdBy` or
 * `convertedCustomerId` from ever reaching the database layer.
 */
const leadBody = {
  name: requiredString("Lead name", 120),
  email,
  phone,
  company: requiredString("Company", 160),
  status: z.enum(LEAD_STATUSES).default("NEW"),
  source: z.enum(LEAD_SOURCES).default("OTHER"),
  assignedTo: nullableObjectId,
  notes: optionalString(2000),
};

export const listLeadsSchema = {
  query: paginationQuery.extend({
    status: z.enum(LEAD_STATUSES).optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    assignedTo: nullableObjectId,
  }),
};

export const getLeadSchema = { params: idParam };

export const createLeadSchema = { body: z.object(leadBody).strip() };

export const updateLeadSchema = {
  params: idParam,
  // Every field optional on update, but at least one must be present.
  body: z
    .object(leadBody)
    .partial()
    .strip()
    .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" }),
};

export const deleteLeadSchema = { params: idParam };

export const convertLeadSchema = {
  params: idParam,
  body: z
    .object({
      owner: nullableObjectId,
      notes: optionalString(2000),
    })
    .strip(),
};
