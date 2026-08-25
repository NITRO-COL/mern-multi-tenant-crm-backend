import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./shared/logger.js";

/**
 * Boot order matters on a platform that health-checks the port.
 *
 * The HTTP server binds FIRST, then the database connects in the background with
 * retries. Awaiting Mongo before listening means a transient database problem —
 * an Atlas IP allowlist that has not been updated, a cold cluster — leaves the
 * port closed, the health check failing, and the platform restart-looping a
 * process that would have recovered on its own.
 *
 * /health reports the database state, so a degraded deployment is visible
 * instead of merely unreachable.
 */

let dbStatus = "connecting";

/**
 * Reconnect forever, with capped exponential backoff.
 *
 * Giving up after N attempts means an infrastructure change that fixes the
 * cause — widening a database allowlist, a cluster finishing its resume — still
 * requires a manual redeploy to take effect. A service that heals itself the
 * moment the dependency returns is strictly better, and the capped backoff keeps
 * a long outage from turning into a busy loop.
 */
async function connectWithRetry({ baseDelayMs = 2000, maxDelayMs = 30_000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await connectDatabase();
      dbStatus = "connected";
      logger.info("MongoDB connected");
      return;
    } catch (err) {
      dbStatus = "error";
      const delay = Math.min(baseDelayMs * attempt, maxDelayMs);

      // Loud and specific the first few times, then quiet — a long outage
      // should not bury every other log line.
      if (attempt <= 3 || attempt % 10 === 0) {
        logger.error(
          `MongoDB connection failed (attempt ${attempt}) — retrying in ${delay / 1000}s. ` +
            "Check MONGODB_URI and that the database allows connections from this host " +
            "(Atlas -> Network Access).",
          err.message
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function start() {
  const app = createApp({ getDbStatus: () => dbStatus });

  const server = app.listen(env.PORT, "0.0.0.0", () => {
    logger.info(`API listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  // Deliberately not awaited — the port is already open.
  connectWithRetry();

  mongoose.connection.on("connected", () => { dbStatus = "connected"; });
  mongoose.connection.on("disconnected", () => { dbStatus = "disconnected"; });

  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down`);
    server.close(() => {
      mongoose.connection.close(false).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", reason);
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception — shutting down", err);
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5_000).unref();
  });
}

start();
