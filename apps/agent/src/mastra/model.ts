import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createDeepSeek } from '@ai-sdk/deepseek';

/**
 * The language model that backs the analyst agent.
 *
 * Two wire protocols are supported — Anthropic Messages and OpenAI Chat
 * Completions — plus a DeepSeek convenience preset. Every provider is used via
 * its AI SDK package *directly* (never Mastra's `'provider/model'` router
 * string, which routes through a models.dev gateway that fails in
 * offline/restricted environments), and every one takes a custom model id and
 * base URL so it can point at a self-hosted or proxied endpoint.
 *
 *   - `anthropic` — Anthropic Messages API: Claude or any Anthropic-compatible
 *                   endpoint. Env: ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL /
 *                   ANTHROPIC_MODEL_ID.
 *   - `openai`    — OpenAI Chat Completions API and any OpenAI-compatible
 *                   endpoint (OpenAI, DeepSeek, OpenRouter, vLLM, Ollama, …).
 *                   Env: OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL_ID.
 *   - `deepseek`  — preset for DeepSeek (OpenAI-compatible under the hood, with
 *                   reasoning-token handling for `deepseek-reasoner`).
 *                   Env: DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL_ID.
 *
 * Selection: `LLM_PROVIDER` wins if set to a known value; otherwise we infer it
 * from whichever API key is configured (Anthropic wins ties, for back-compat).
 */
export type Provider = 'anthropic' | 'openai' | 'deepseek';

const env = (key: string) => process.env[key]?.trim() || undefined;

function selectProvider(): Provider {
  const explicit = env('LLM_PROVIDER')?.toLowerCase();
  if (explicit === 'anthropic' || explicit === 'openai' || explicit === 'deepseek') return explicit;
  if (env('ANTHROPIC_API_KEY')) return 'anthropic';
  if (env('DEEPSEEK_API_KEY')) return 'deepseek';
  if (env('OPENAI_API_KEY')) return 'openai';
  return 'anthropic';
}

export const PROVIDER: Provider = selectProvider();

function buildAnthropic() {
  // The AI SDK default base URL is `https://api.anthropic.com/v1`. Some
  // environments (including Claude Code's) set `ANTHROPIC_BASE_URL` *without*
  // the `/v1` suffix, which makes the SDK POST to `/messages` and 404.
  // Normalize so the base URL always ends in `/v{n}`.
  const rawBase = (env('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com').replace(/\/+$/, '');
  const baseURL = /\/v\d+$/.test(rawBase) ? rawBase : `${rawBase}/v1`;
  const id = env('ANTHROPIC_MODEL_ID') || 'claude-opus-4-8';
  return { model: createAnthropic({ baseURL })(id), id };
}

function buildOpenAICompatible() {
  // Generic OpenAI Chat Completions protocol. `baseURL` + `OPENAI_MODEL_ID`
  // let this same path drive OpenAI, DeepSeek, OpenRouter, a local vLLM, etc.
  // `apiKey` may be undefined (e.g. an unauthenticated local endpoint).
  const baseURL = env('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
  const id = env('OPENAI_MODEL_ID') || 'gpt-4o-mini';
  const provider = createOpenAICompatible({
    name: 'openai-compatible',
    baseURL,
    apiKey: env('OPENAI_API_KEY'),
  });
  return { model: provider(id), id };
}

function buildDeepSeek() {
  // DeepSeek is OpenAI-compatible; the dedicated provider also extracts the
  // reasoning tokens that `deepseek-reasoner` returns. Reads DEEPSEEK_API_KEY
  // and defaults to `https://api.deepseek.com/v1`; DEEPSEEK_BASE_URL overrides.
  const id = env('DEEPSEEK_MODEL_ID') || 'deepseek-chat';
  const deepseek = createDeepSeek({ baseURL: env('DEEPSEEK_BASE_URL') });
  return { model: deepseek(id), id };
}

const resolved =
  PROVIDER === 'anthropic'
    ? buildAnthropic()
    : PROVIDER === 'deepseek'
      ? buildDeepSeek()
      : buildOpenAICompatible();

/** The resolved language model, ready to hand to a Mastra `Agent`. */
export const model = resolved.model;

/** The active model id (for logging / display). */
export const MODEL_ID = resolved.id;
