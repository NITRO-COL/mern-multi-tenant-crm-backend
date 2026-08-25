import { jest } from "@jest/globals";

// Env must exist before any module imports config/env.js.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-definitely-long-enough-1234567890";
process.env.MONGODB_URI = "mongodb://placeholder/test"; // replaced by the in-memory server
process.env.BCRYPT_ROUNDS = "8";                        // keep hashing fast in tests
process.env.LOG_LEVEL = "silent";

jest.setTimeout(60_000);
