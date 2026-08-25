export default {
  testEnvironment: "node",
  transform: {},                       // native ESM — no Babel step
  testMatch: ["**/tests/**/*.test.js"],
  testTimeout: 60_000,                 // first run downloads the in-memory MongoDB binary
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  verbose: true,
};
