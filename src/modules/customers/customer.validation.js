import { z } from "zod";
import { CUSTOMER_STATUSES } from "./customer.model.js";
import {
  email, idParam, nullableObjectId, optionalString,
  paginationQuery, phone, requiredString,
} from "../../shared/validators.js";

const customerBody = {
  name: requiredString("Customer name", 120),
  email,
  phone,
  company: requiredString("Company", 160),
  status: z.enum(CUSTOMER_STATUSES).default("ACTIVE"),
  owner: nullableObjectId,
  notes: optionalString(2000),
};

export const listCustomersSchema = {
  query: paginationQuery.extend({
    status: z.enum(CUSTOMER_STATUSES).optional(),
    owner: nullableObjectId,
  }),
};

export const getCustomerSchema = { params: idParam };
export const createCustomerSchema = { body: z.object(customerBody).strip() };
export const updateCustomerSchema = {
  params: idParam,
  body: z.object(customerBody).partial().strip()
    .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" }),
};
export const deleteCustomerSchema = { params: idParam };
