import { z } from "zod";
import { email, requiredString } from "../../shared/validators.js";

export const loginSchema = {
  body: z
    .object({
      email,
      password: z.string().min(1, "Password is required").max(200),
      // slug lets two tenants share an email address; optional for convenience.
      tenantSlug: z.string().trim().toLowerCase().max(60).optional(),
    })
    .strip(), // any extra key the client sends — including tenantId — is dropped
};

export const platformLoginSchema = {
  body: z.object({ email, password: z.string().min(1, "Password is required").max(200) }).strip(),
};

export const registerTenantUserSchema = {
  body: z
    .object({
      name: requiredString("Name", 120),
      email,
      password: z.string().min(8, "Password must be at least 8 characters").max(200),
      role: z.enum(["ADMIN", "SALES"]).default("SALES"),
    })
    .strip(),
};
