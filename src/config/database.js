import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../shared/logger.js";

/**
 * Connect to MongoDB.
 *
 * maxPoolSize is capped deliberately: every API instance holds its own pool, so
 * an unbounded pool multiplied across instances is how you exhaust an Atlas
 * cluster's connection limit under load.
 */
export async function connectDatabase(uri = env.MONGODB_URI) {
  mongoose.set("strictQuery", true);

  // Never let a query hang a request forever — surface a timeout instead.
  mongoose.set("bufferTimeoutMS", 10_000);

  await mongoose.connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });

  logger.info(`MongoDB connected: ${mongoose.connection.name}`);

  mongoose.connection.on("error", (err) => logger.error("MongoDB error", err));
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));

  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
}
