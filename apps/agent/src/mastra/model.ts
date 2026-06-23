import { createAnthropic } from '@ai-sdk/anthropic';

/**
 * The Anthropic provider for the agent.
 *
 * The AI SDK's default base URL is `https://api.anthropic.com/v1`. Some
 * environments (including Claude Code's) set `ANTHROPIC_BASE_URL` *without* the
 * `/v1` suffix, which makes the SDK POST to `/messages` and 404. Normalize the
 * base URL so it always ends in `/v{n}`.
 */
const raw = (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://api.anthropic.com').replace(
  /\/+$/,
  '',
);
const baseURL = /\/v\d+$/.test(raw) ? raw : `${raw}/v1`;

export const anthropic = createAnthropic({ baseURL });

export const MODEL_ID = 'claude-opus-4-8';
