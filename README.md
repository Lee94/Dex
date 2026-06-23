# Dex

An agentic, conversational data-analysis tool — a learning prototype inspired by
[Hex Threads](https://hex.tech/product/threads/). You ask a question in plain
language; an AI agent explores a SQL warehouse (listing tables, inspecting
schemas, writing SQL), **shows its work step by step**, and answers with text +
result cards (tables and bar charts).

- **Agent backend:** [Mastra](https://mastra.ai) (TypeScript) + Claude
  (`claude-opus-4-8`) via the [AI SDK](https://ai-sdk.dev) Anthropic provider.
- **Frontend:** React + Vite, implementing a Claude Design handoff — a
  [Blueprint](https://blueprintjs.com)-styled "Notebook" app shell, branded **Dex**.
- **Data:** a bundled sample e-commerce SQLite warehouse (zero external setup).

## Layout

```
apps/
  agent/    # Mastra backend: the `analyst` agent, SQL tools, sample warehouse
  web/      # React UI (Blueprint design): app shell, threads list, live thread chat
design/     # The Claude Design handoff (reference): Notebook.dc.html + design system
```

Backend (`apps/agent/src/mastra/`):

- `agents/analyst.ts` — the data-analyst agent (instructions + model + tools).
- `model.ts` — the Anthropic provider (normalizes the API base URL).
- `tools/` — `list_tables`, `describe_table`, `run_sql` (read-only SELECT guard).
- `db/` — `warehouse.ts` (libsql client), `queries.ts` (helpers), `seed.ts`
  (sample dataset), `smoke.ts` (non-LLM checks).

The UI maps the agent's stream onto the design: tool calls → the collapsible
**"thinking" timeline**; streamed text → the answer; `run_sql` results → the
**result card** (a table, or a funnel-style bar chart for two-column numeric
results).

## Run it

Requires Node 22+. Two terminals.

```bash
# 1. Backend
cd apps/agent
cp .env.example .env          # then put your real key in .env:
#   ANTHROPIC_API_KEY=sk-ant-...   (https://console.anthropic.com/settings/keys)
npm install
npm run seed                  # build the sample warehouse.db
npm run dev                   # Mastra dev server + Studio at http://localhost:4111

# 2. Frontend (second terminal)
cd apps/web
npm install
npm run dev                   # Vite at http://localhost:5173
```

Open http://localhost:5173, click **New thread**, and ask e.g.
_"Top 5 products by revenue"_ or _"Monthly revenue trend this year"_. You can
also chat with the agent directly in Mastra Studio at http://localhost:4111.

### Verify without an API key

The data layer and tools run without Claude:

```bash
cd apps/agent
npm run seed      # seeds the warehouse
npm run smoke     # exercises the SQL tools + the read-only guard
```

## Sample data

`apps/agent/src/mastra/db/seed.ts` creates a small e-commerce schema —
`customers`, `products`, `orders`, `order_items` — enough for questions like
"top products by revenue", "monthly revenue trend", or "best customers".

## Status & roadmap

Implemented (step 1): the **Notebook.dc.html** design — app shell (sidebar, nav,
recents), the Threads list, and the focused **thread chat wired to the live
agent**.

Next: chart-type selection · semantic/"endorsed" data layer · conversation
memory & saved threads · real warehouse connections (Postgres) · the full
cell-based **NotebookEditor**.
