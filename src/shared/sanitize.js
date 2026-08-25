/**
 * Escape user input before it is placed inside a RegExp.
 *
 * Without this, a search term like `(a+)+$` becomes a catastrophic-backtracking
 * pattern (ReDoS) and `.*` turns a scoped search into a full scan.
 */
export function escapeRegex(input = "") {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive "contains" matcher from untrusted input.
 * Returns undefined for empty/too-short terms so callers can skip the filter.
 */
export function buildSearchRegex(term, { minLength = 1 } = {}) {
  const trimmed = String(term ?? "").trim();
  if (trimmed.length < minLength) return undefined;
  return new RegExp(escapeRegex(trimmed), "i");
}
