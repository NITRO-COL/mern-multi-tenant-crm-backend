import { z } from "zod";
import { ACTIVITY_TYPES } from "./activity.model.js";
import { idParam, objectId, optionalString, requiredString } from "../../shared/validators.js";

export const createActivitySchema = {
  body: z
    .object({
      type: z.enum(ACTIVITY_TYPES, { errorMap: () => ({ message: `Type must be one of: ${ACTIVITY_TYPES.join(", ")}` }) }),
      title: requiredString("Title", 200),
      description: optionalString(2000),
      leadId: objectId.optional(),
      customerId: objectId.optional(),
      dueAt: z.coerce.date().optional().nullable(),
    })
    .strip()
    // An activity hangs off exactly one record — never both, never neither.
    .refine((v) => Boolean(v.leadId) !== Boolean(v.customerId), {
      message: "Provide exactly one of leadId or customerId",
      path: ["leadId"],
    }),
};

export const listActivitiesSchema = {
  params: z.object({ recordId: objectId }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

export const deleteActivitySchema = { params: idParam };
