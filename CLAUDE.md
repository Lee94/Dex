# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Dex — an agentic data-analysis "Threads" prototype (inspired by Hex Threads). A user asks a data question in natural language; an AI agent explores a SQL warehouse, streams its step-by-step work, and answers with text + result cards. Learning/prototype.

## Monorepo layout — two standalone apps, NOT npm workspaces

`apps/agent` and `apps/web` are **independent npm projects** (each has its own `node_modules`; run `npm install` in each separately). The root `package.json` is tooling-only (Prettier, husky, lint-staged) with no `workspaces` field. `design/` holds the Claude Design handoff the UI implements — reference artifacts only (`Notebook.dc.html` is implemented; `NotebookEditor.dc.html` is not yet).

## Commands

Root (repo-wide):

- `npm run format` / `npm run format:check` — Prettier.
- `npm run typecheck` — typechecks both apps.
- `npm run lint` — oxlint (web).
- Git hooks (husky): **pre-commit** runs lint-staged (Prettier on staged files); **pre-push** runs `typecheck + lint`.

`apps/agent` (Mastra backend):

- `cp .env.example .env`, then set `ANTHROPIC_API_KEY` — required for the live LLM loop.
- `npm run seed` — (re)creates the sample `warehouse.db`. **Must be run before the agent can answer anything.**
- `npm run smoke` — exercises the SQL query layer/tools **without the LLM** (no API key needed). This is the closest thing to a test suite — run it after touching `db/` or `tools/`.
- `npm run dev` — Mastra dev server + Studio at http://localhost:4111.
- `npm run typecheck` (`tsc --noEmit`).

`apps/web` (React + Vite UI):

- `npm run dev` — Vite at http://localhost:5173 (expects the agent on :4111; override with `VITE_MASTRA_URL`).
- `npm run build` (`tsc -b && vite build`) · `npm run typecheck` (`tsc -b`) · `npm run lint` / `lint:fix` (oxlint).

There is no unit-test framework yet. Verification = typecheck + build + lint + the agent's `npm run smoke`.

## Architecture

### Agent — `apps/agent/src/mastra/`

- `index.ts` — the `Mastra` instance. Registers the agent under the key **`analyst`** (this exact key is how the web client addresses it), with a LibSQL store and permissive CORS for the Vite origin.
- `agents/analyst.ts` — the data-analyst agent: instructions + model + the three tools.
- `model.ts` — the Anthropic provider. Uses **`@ai-sdk/anthropic` directly**; do NOT switch to Mastra's `'anthropic/…'` model-router string — it routes through a models.dev gateway that fails in offline/restricted environments. It also normalizes `ANTHROPIC_BASE_URL` to end in `/v1` (some environments, including Claude Code's, set it without the suffix, which makes requests 404). The model id is the `MODEL_ID` constant here.
- `db/queries.ts` — **the real warehouse logic lives here**: `listTables`, `describeTable`, `runReadOnlySql`, and `assertReadOnly` (the read-only guard: single statement, must start with SELECT/WITH, rejects DML/DDL). Deliberately kept separate from the tools so it's testable without the LLM (see `db/smoke.ts`).
- `tools/*.ts` — thin `createTool` wrappers over `db/queries.ts`. Note: in this Mastra version, `createTool`'s `execute` receives the parsed input as its **first argument**.
- `db/warehouse.ts` (libsql client) + `db/seed.ts` (sample e-commerce schema: customers/products/orders/order_items).

There are two SQLite files, both gitignored: **`warehouse.db`** = the sample data the agent queries; **`mastra.db`** = Mastra's own conversation/telemetry storage. They are not the same thing.

### Web — `apps/web/src/`

- Implements the Blueprint-styled "Dex" design from `design/`. `App.tsx` is a small view state machine (`threads | thread | notebook | other`); the thread view is code-split via `React.lazy`.
- **Agent stream wiring** is the heart of the app: `hooks/useThreads.ts` calls `analystAgent.stream(messages).processDataStream({ onChunk })` and maps Mastra stream chunks onto UI state — `text-delta` → the answer; `tool-call`/`tool-result` → the collapsible "thinking" step timeline; a `run_sql` result (shape-detected by `isSqlResult` in `types.ts`) → a `ResultCard` (a table, or a bar chart for two-column numeric results). Streaming is soft-stoppable: the SDK client stream takes no abort signal, so Stop ignores further chunks and best-effort cancels the response body.
- `lib/mastraClient.ts` — `MastraClient` pointed at `config.mastraBaseUrl`; `analystAgent = mastra.getAgent('analyst')`.

### Styling system (important)

CSS Modules over a token layer — **do not hardcode hex/rgba in components.** `src/index.css` imports the vendored Blueprint tokens (`src/blueprint/`) then `src/styles/theme.css`, which defines `--dex-*` semantic tokens mapping the design's literal values onto Blueprint `--bp-*` vars. Each component has a co-located `*.module.css` referencing those vars; reuse the primitives in `components/ui/` (IconButton, Button, Pill, Avatar). Imports use the `@/` path alias (`@/* → src/*`).

## Conventions & gotchas

- Two apps, no workspaces → install and run each app separately.
- Web↔agent contract: the agent must stay registered as `analyst`, and the web client streams from the Mastra dev server (:4111). Renaming the agent key requires updating `getAgent('analyst')` and the registry key in `index.ts`.
- Read-only SQL only: any new query path must go through `assertReadOnly`.
- After changing the warehouse schema/seed, re-run `npm run seed` then `npm run smoke`.
- `src/blueprint/` and `design/` are vendored / handoff artifacts — don't edit or reformat them (they're in `.prettierignore`).
