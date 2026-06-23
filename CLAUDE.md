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
- `agents/analyst.ts` — the data-analyst agent: instructions + model + six tools (three semantic-layer + three raw-SQL) + Mastra `Memory`. Its instructions tell it to **prefer the semantic model** and fall back to raw SQL for the long tail. Instructions/tool descriptions are dialect-aware (SQLite vs Postgres).
- `model.ts` — resolves the agent's language model from env. Supports two wire protocols plus a preset, each selectable via `LLM_PROVIDER` (`anthropic` | `openai` | `deepseek`) or inferred from whichever API key is set (Anthropic wins ties): **`anthropic`** (`@ai-sdk/anthropic`), **`openai`** (`@ai-sdk/openai-compatible` — OpenAI/DeepSeek/OpenRouter/vLLM/Ollama/…), **`deepseek`** (`@ai-sdk/deepseek`). Each takes a custom `*_MODEL_ID` and `*_BASE_URL`. Every provider is used via its AI SDK package **directly**; do NOT switch to Mastra's `'provider/…'` model-router string — it routes through a models.dev gateway that fails in offline/restricted environments. For Anthropic it also normalizes `ANTHROPIC_BASE_URL` to end in `/v1` (some environments, including Claude Code's, set it without the suffix, which makes requests 404). Exports the resolved `model` (hand straight to the `Agent`), plus `PROVIDER` / `MODEL_ID` for display. See `.env.example` for all knobs.
- **Warehouse data layer (connector seam, v0.3).** Queries go through a `Connector` interface so the agent can target the bundled SQLite sample _or_ a live Postgres warehouse without the tools/UI changing:
  - `db/types.ts` — shared types + the `Connector` interface (`listTables` / `describeTable` / `runReadOnlySql`).
  - `db/guard.ts` — `assertReadOnly` (single statement, must start SELECT/WITH, rejects DML/DDL) + `IDENTIFIER`. The **universal** gate; runs before any SQL executes.
  - `db/connectors/sqlite.ts` (default) + `db/connectors/postgres.ts` (`pg`; `information_schema` introspection, read-only transaction + `statement_timeout` + row caps as defense in depth).
  - `db/connector.ts` — `getActiveProvider()` / `getConnector()` (lazy, cached) resolve the active connector from env (`WAREHOUSE_PROVIDER` = `sqlite` | `postgres`, else inferred from `DATABASE_URL`/`PGHOST`); `dialectHint()` feeds the agent dialect-specific syntax.
  - `db/queries.ts` — now a thin **façade** that delegates `listTables`/`describeTable`/`runReadOnlySql` to the active connector and re-exports the guard + types (keeps the old import surface for the tools/smoke).
- **Semantic layer (CubeJS-style, v0.4) — `db/semantic/`.** A typed, hand-authored model + a query→SQL compiler: `types.ts` (cubes/measures/dimensions/joins/metrics + the semantic-query shape), `model.ts` (the sample model; **endorsed** metrics like `revenue`/`completed_revenue`), `compile.ts` (member resolution, BFS join-path planning, dialect-aware time grains, escaped filter values), `validate.ts` (structural checks, run at load), `index.ts` (`runSemanticQuery` = compile → `assertReadOnly` → connector; plus the catalog/summary builders). The compiled SQL **never bypasses** the read-only guard.
- `tools/*.ts` — thin `createTool` wrappers. SQL tools: `list_tables`, `describe_table`, `run_sql` (over `db/queries.ts`). Semantic tools: `list_metrics`, `describe_model`, `query_semantic` (over `db/semantic`). Note: in this Mastra version, `createTool`'s `execute` receives the parsed input as its **first argument**. A `query_semantic` result carries `via:'semantic'`, the compiled `sql`, and an `endorsed` flag the UI surfaces.
- `db/warehouse.ts` (libsql client for the SQLite connector) + `db/seed.ts` (sample e-commerce schema: customers/products/orders/order_items).

There are two SQLite files, both gitignored: **`warehouse.db`** = the sample data the agent queries; **`mastra.db`** = Mastra's own conversation/telemetry storage (now used for real by v0.2 thread persistence). They are not the same thing.

### Web — `apps/web/src/`

- Implements the Blueprint-styled "Dex" design from `design/`. `App.tsx` is a small view state machine (`threads | thread | notebook | other`); the thread view is code-split via `React.lazy`.
- **Agent stream wiring** is the heart of the app: `hooks/useThreads.ts` calls `analystAgent.stream(messages, { memory: { thread, resource } }).processDataStream({ onChunk })` and maps Mastra stream chunks onto UI state — `text-delta` → the answer; `tool-call`/`tool-result` → the collapsible "thinking" step timeline; a `run_sql` / `query_semantic` result (shape-detected by `isSqlResult` in `types.ts`) → a `ResultCard` (table or bar chart). `resultProvenance()` reads a semantic result's compiled `sql` + `endorsed` flag so the card can show a **"Trusted definition"** pill. Streaming is soft-stoppable.
- **Persistence (v0.2) — `lib/threads.ts`.** Threads live in Mastra memory (`mastra.db`) keyed by a stable `threadId` + a single-user `RESOURCE_ID`. This module lists threads, lazy-loads a thread's history, renames/deletes, and **reconstructs** the thinking timeline + result cards from stored message parts. `useThreads` loads the list on mount, hydrates messages on open, and persists the active selection in `localStorage`. The sidebar recents + threads list are real (rename/delete + empty/loading/error states).
- `lib/mastraClient.ts` — `MastraClient` pointed at `config.mastraBaseUrl`; `analystAgent = mastra.getAgent('analyst')`.

### Styling system (important)

CSS Modules over a token layer — **do not hardcode hex/rgba in components.** `src/index.css` imports the vendored Blueprint tokens (`src/blueprint/`) then `src/styles/theme.css`, which defines `--dex-*` semantic tokens mapping the design's literal values onto Blueprint `--bp-*` vars. Each component has a co-located `*.module.css` referencing those vars; reuse the primitives in `components/ui/` (IconButton, Button, Pill, Avatar). Imports use the `@/` path alias (`@/* → src/*`).

## Conventions & gotchas

- Two apps, no workspaces → install and run each app separately.
- Web↔agent contract: the agent must stay registered as `analyst`, and the web client streams from the Mastra dev server (:4111). Renaming the agent key requires updating `getAgent('analyst')` and the registry key in `index.ts`.
- Read-only SQL only: any new query path must go through `assertReadOnly` (`db/guard.ts`) — including compiled semantic SQL.
- New warehouse backends plug into the `Connector` interface (`db/types.ts`); don't query a driver directly from the tools. Point Dex at Postgres via env (see `.env.example`); never commit credentials.
- The semantic model is a typed config (`db/semantic/model.ts`) validated at load — add measures/dimensions/joins/metrics there; the compiler and tools pick them up automatically.
- After changing the warehouse schema/seed, re-run `npm run seed` then `npm run smoke` (smoke now also covers the connector interface + the semantic compiler).
- `src/blueprint/` and `design/` are vendored / handoff artifacts — don't edit or reformat them (they're in `.prettierignore`).
