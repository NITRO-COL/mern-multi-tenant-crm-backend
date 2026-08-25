import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

import authRoutes from "./modules/auth/auth.routes.js";
import leadRoutes from "./modules/leads/lead.routes.js";
import customerRoutes from "./modules/customers/customer.routes.js";
import activityRoutes from "./modules/activities/activity.routes.js";
import reportRoutes from "./modules/reports/report.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import platformRoutes from "./modules/tenants/tenant.routes.js";

export function createApp() {
  const app = express();

  // Behind Render/Vercel proxies — required for correct client IPs in rate limiting.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin/curl requests have no Origin header — allow them through.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));

  if (!env.isTest) app.use(morgan(env.isProd ? "combined" : "dev"));

  // Baseline throttle for the whole API; /auth/login has its own tighter limit.
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.isTest ? 100_000 : 500,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    })
  );

  app.get("/health", (_req, res) =>
    res.json({ success: true, data: { status: "ok", uptime: process.uptime(), env: env.NODE_ENV } })
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/leads", leadRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/activities", activityRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/platform", platformRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
