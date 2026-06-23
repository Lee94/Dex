# Dex

An exploration of a [Hex](https://hex.tech/)-like product, built step by step.

The first feature we're building is Hex's **[Threads](https://hex.tech/product/threads/)** —
an _agentic, conversational_ data-analysis experience. You ask a question in plain
language; an AI agent explores the data, **shows its step-by-step reasoning** (which
tables it inspects, the SQL it runs, the results it gets), and answers with grounded
numbers.

## Architecture

```
React web app (apps/web)  ──stream──▶  Mastra dev server (apps/agent, :4111)
                                            │  "analyst" agent (Claude, claude-opus-4-8)
                                            │  tools: list_tables / describe_table / run_sql
                                            ▼
                                       warehouse.db  (sample e-commerce SQLite)
```

- **Backend** — [Mastra](https://mastra.ai/) (TypeScript AI agent framework). The
  agent is given read-only SQL tools over a sample SQLite "warehouse" and streams its
  reasoning + tool calls to the client.
- **Frontend** — React + Vite, consuming the agent's stream via `@mastra/client-js`.

## Getting started

Two standalone apps. You need an Anthropic API key for the agent to call Claude.

### 1. Backend (`apps/agent`)

```bash
cd apps/agent
npm install
cp .env.example .env          # then put your real ANTHROPIC_API_KEY in .env
npm run seed                  # build the sample warehouse.db
npm run dev                   # Mastra dev server + Studio at http://localhost:4111
```

Useful scripts:

| Script           | What it does                                                       |
| ---------------- | ----------------------------------------------------------------- |
| `npm run seed`   | (Re)creates `warehouse.db` with sample e-commerce data            |
| `npm run smoke`  | Exercises the SQL tools **without** the LLM (no API key needed)    |
| `npm run dev`    | Runs the agent dev server + Mastra Studio (:4111)                 |
| `npm run typecheck` | Type-checks the backend                                        |

In Studio you can chat with the **analyst** agent directly to confirm it works.

### 2. Frontend (`apps/web`)

```bash
cd apps/web
npm install
npm run dev                   # Vite dev server at http://localhost:5173
```

> The web UI is being implemented against a custom notebook design and is a
> work in progress.

## Sample data

`apps/agent/src/mastra/db/seed.ts` creates a small e-commerce schema:
`customers`, `products`, `orders`, `order_items` — enough to answer questions like
"top products by revenue", "monthly revenue trend", or "best customers".

## Roadmap

1. ✅ Minimal agentic loop: ask → agent explores schema, runs SQL, answers (with steps shown).
2. Visualizations (chart tools + chart rendering).
3. Trusted data / semantic layer; multiple connections.
4. Conversation memory & saved threads.
5. Real warehouse connections (Postgres) + access governance.
6. Notebook view — promote a thread's SQL/charts into editable cells.
