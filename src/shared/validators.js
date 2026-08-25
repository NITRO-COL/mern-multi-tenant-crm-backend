import { z } from "zod";
import mongoose from "mongoose";

export const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .email("Enter a valid email address");

export const requiredString = (label, max = 160) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const optionalString = (max = 2000) =>
  z.string().trim().max(max).optional().default("");

export const phone = z
  .string()
  .trim()
  .min(7, "Phone must be at least 7 digits")
  .max(20, "Phone is too long")
  .regex(/^[+]?[\d\s()-]+$/, "Enter a valid phone number");

/** Accepts "" / "null" from query strings and normalises them away. */
export const nullableObjectId = z
  .union([objectId, z.literal(""), z.literal("null"), z.null()])
  .optional()
  .transform((v) => (v === "" || v === "null" || v === undefined ? null : v));

/**
 * Shared list-query contract: page/limit/search/sort.
 * `limit` is hard-capped so a client cannot request the entire collection.
 */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).optional().default(""),
  sortBy: z.string().trim().max(40).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const idParam = z.object({ id: objectId });
