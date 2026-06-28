import type { Dict } from '@/i18n';

/** Heuristic: does this provider error look like an auth / API-key failure?
 *  Covers the common shapes — HTTP 401/403, "Unauthorized", "Invalid API Key"
 *  (e.g. the AI SDK's `AI_APICallError`), and key-name mentions. */
const AUTH_RE =
  /unauthor|forbidden|invalid[\s_-]?key|api[\s_-]?key|\b401\b|\b403\b|authentication/i;

export function isLlmAuthError(raw: string): boolean {
  return AUTH_RE.test(raw);
}

/**
 * Turn a raw LLM/stream error into a user-facing message. Auth/key failures get
 * a friendly, actionable explanation (which env var to fix + restart) with the
 * raw cause kept in parentheses; everything else passes through unchanged.
 * Returns '' for an empty input so callers can fall back to a generic message.
 */
export function llmErrorMessage(raw: string, t: Dict): string {
  if (!raw) return '';
  return isLlmAuthError(raw) ? t.llmError.auth(raw) : raw;
}
