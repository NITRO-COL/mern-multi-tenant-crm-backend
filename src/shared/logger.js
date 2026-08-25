/* Minimal leveled logger — structured enough to grep, no dependency needed. */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === "test" ? -1 : 2);

const stamp = () => new Date().toISOString();

function emit(level, msg, meta) {
  if (LEVELS[level] > active) return;
  const line = `${stamp()} [${level.toUpperCase()}] ${msg}`;
  if (meta !== undefined) console[level === "debug" ? "log" : level](line, meta);
  else console[level === "debug" ? "log" : level](line);
}

export const logger = {
  error: (msg, meta) => emit("error", msg, meta),
  warn: (msg, meta) => emit("warn", msg, meta),
  info: (msg, meta) => emit("info", msg, meta),
  debug: (msg, meta) => emit("debug", msg, meta),
};
