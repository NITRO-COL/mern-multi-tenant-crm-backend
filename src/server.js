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

async function connectWithRetry({ attempts = 10, baseDelayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await connectDatabase();
      dbStatus = "connected";
      return;
    } catch (err) {
      dbStatus = "error";
      const delay = Math.min(baseDelayMs * attempt, 30_000);
      logger.error(
        `MongoDB connection failed (attempt ${attempt}/${attempts}) — retrying in ${delay / 1000}s`,
        err.message
      );
      if (attempt === attempts) {
        logger.error(
          "Could not reach MongoDB. Check MONGODB_URI and that the database " +
            "allows connections from this host (Atlas -> Network Access)."
        );
        return;
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
