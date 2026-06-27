/**
 * Shared HTTP helpers for the root API route modules (`routes.ts`,
 * `project-routes.ts`, `task-routes.ts`, …). Kept tiny and dependency-free.
 */

/** A JSON error body + status the handlers return via `c.json(fail(...), status)`. */
export function fail(message: string, status = 400) {
  return { error: message, status };
}
