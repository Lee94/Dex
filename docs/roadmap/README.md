# Dex — Roadmap & version plan

The product-level roadmap for **Dex**, the agentic data-analysis "Threads"
prototype. Each milestone below is a coherent slice of user value; the per-version
files in this folder hold the detail (goal, scope, technical approach, and a
"done when" checklist).

> **Versioning note.** These are **product milestones** for the prototype, tracked
> independently of the per-package npm versions in `apps/*/package.json` (which
> are not bumped in lockstep). Everything pre-`v1.0.0` is still a learning
> prototype — scope and sequencing can change as we learn.

> **Current focus: Thread mode.** The conversational analyst (Thread mode) is the
> center of gravity. The near-term track deepens the **agent** (v0.8–v0.9, then
> v1.1–v1.3). The **notebook** surface shipped its core early as a spike (v2.0),
> but its **expansion is deliberately deferred to the back** (v2.1–v2.3) while
> Thread mode is the priority.

## Status legend

| Symbol | Meaning              |
| ------ | -------------------- |
| ✅     | Shipped              |
| 🚧     | In progress          |
| 📋     | Planned              |
| 💡     | Icebox (unscheduled) |

## Timeline

| Version                                      | Theme                    | Track      | Status          | One-liner                                                                                                        |
| -------------------------------------------- | ------------------------ | ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| [v0.1.0](./v0.1.0-threads-mvp.md)            | Threads MVP              | Thread     | ✅ Shipped      | Agentic SQL analyst + Blueprint "Dex" thread UI wired to the live agent.                                         |
| [v0.2.0](./v0.2.0-persistence.md)            | Persistence              | Thread     | ✅ Shipped      | Conversation memory + saved/named threads that survive a refresh.                                                |
| [v0.3.0](./v0.3.0-live-warehouses.md)        | Live warehouses          | Data       | ✅ Shipped      | Real Postgres connections behind a clean connector interface.                                                    |
| [v0.4.0](./v0.4.0-semantic-layer.md)         | Semantic layer           | Data       | ✅ Shipped      | A CubeJS-style model (cubes, measures, dimensions, joins) the agent queries for trusted metrics.                 |
| [v0.5.0](./v0.5.0-richer-results.md)         | Richer results           | Thread     | ✅ Shipped      | Chart-type selection, time-series charts, and table/CSV export on result cards.                                  |
| [v0.6.0](./v0.6.0-data-sources.md)           | Data sources & catalog   | Data       | ✅ Shipped      | A Data browser: register connections, browse schema/tables + previews, explore the model, curate metadata.       |
| [v0.7.0](./v0.7.0-data-management.md)        | Data management          | Data       | ✅ Shipped      | Delete connections, add/delete data models, attach a database/table/model to a question from the composer "+".   |
| [v0.8.0](./v0.8.0-catalog-aware-agent.md)    | Catalog-aware agent      | Thread     | ✅ Shipped      | The agent reads the curated catalog (descriptions/endorsed, honors `includedForAi`) and can list/target sources. |
| [v0.9.0](./v0.9.0-agent-knowledge-memory.md) | Agent knowledge & memory | Thread     | ✅ Shipped      | Org guides the agent consults + durable cross-thread memory of preferences (+ review suggestions).               |
| [v1.0.0](./v1.0.0-quality-foundation.md)     | Quality foundation       | Foundation | 📋 Planned      | Automated tests (Vitest / RTL) + CI (GitHub Actions) — the prototype graduates into a tested 1.0 product.        |
| [v1.1.0](./v1.1.0-external-context.md)       | External context         | Thread     | 📋 Planned      | Web search/extract + reading uploaded files — Thread mode reaches beyond the warehouse.                          |
| [v1.2.0](./v1.2.0-specialized-agents.md)     | Specialized agents       | Thread     | 📋 Planned      | A planner + specialist sub-agents (data discovery, visualization) the analyst delegates to.                      |
| [v1.3.0](./v1.3.0-scheduling-alerts.md)      | Scheduling & alerts      | Thread     | 📋 Planned      | Scheduled re-runs with email/Slack delivery + alerts, and recall across past threads.                            |
| [v2.0.0](./v2.0.0-notebook-editor.md)        | NotebookEditor           | Notebook   | 🚧 Core shipped | The cell-based notebook + Hex agent model (authors/chains/embeds SQL cells). An early spike.                     |
| [v2.1.0](./v2.1.0-richer-cells.md)           | Richer cells & cell ops  | Notebook   | 📋 Deferred     | Semantic + markdown cells; the agent can edit/reorder cells and read an upstream cell's output.                  |
| [v2.2.0](./v2.2.0-charts-and-viz.md)         | Charts & viz             | Notebook   | 📋 Deferred     | Charts as notebook cells with agent-chosen visualization (builds on v0.5).                                       |
| [v2.3.0](./v2.3.0-python-kernel.md)          | Python & kernel          | Notebook   | 📋 Deferred     | A sandboxed Python/duckdb kernel — Python cells, dataframe SQL, cross-source chaining.                           |

The **Thread** track (v0.5, v0.8–v0.9, v1.1–v1.3) is the priority. The **Notebook**
track (v2.x) is parked behind it — v2.0's core already shipped, but v2.1–v2.3 wait
until Thread mode is where we want it.

## How the milestones build on each other

```
THREAD MODE (the center — near-term)
  v0.1 MVP ─► v0.2 persistence ─► v0.3 warehouses ─► v0.4 semantic layer
       ├─► v0.5 richer results (result-card viz + export)
       └─► v0.6 catalog ─► v0.7 data management
              └─► v0.8 catalog-aware agent ─► v0.9 knowledge & memory
                     └─► v1.0 tests + CI
                            └─► v1.1 external context ─► v1.2 specialized agents ─► v1.3 scheduling

NOTEBOOK (deferred to the back)
  v2.0 NotebookEditor (core shipped, early spike)
       └─► v2.1 richer cells & cell ops ─► v2.2 charts & viz ─► v2.3 Python & kernel
```

The plan leads with **features**, then hardens. **v0.2–v0.4** make Dex a real,
data-backed product; **v0.5** sharpens the payoff (better results); **v0.6–v0.7**
turn data sources into a managed catalog. **v0.8–v0.9** then make the _agent_ use
that catalog and carry durable knowledge, and **v1.1–v1.3** extend its reach
(web/files, sub-agents, scheduling) — the Thread-mode agent track, scoped against
the Hex agent reference. **v1.0** pays down deferred engineering (a test runner and
CI). The **notebook** (**v2.0** core shipped) and its expansion (**v2.1–v2.3**) sit
at the back of the queue while Thread mode is the focus.

## Guiding principles

- **Thread mode first.** The conversational analyst is the product's center;
  notebook work is sequenced behind it unless it directly serves Thread mode.
- **Prototype discipline, not enterprise scope.** Each version is the smallest
  thing that delivers the theme. Defer aggressively; record deferrals in each
  doc's _Out of scope_ section.
- **Don't regress the contract.** The web↔agent contract (the `analyst` registry
  key, the Mastra stream the UI maps) and the read-only SQL guard
  (`assertReadOnly`) hold across versions.
- **The design handoff leads the UI.** `design/hex-tech/project/` has three
  surfaces — `Notebook.dc.html` (v0.1), `NotebookEditor.dc.html` (v2.0), and
  `Canvas.dc.html` (icebox). New UI maps back to these.
- **Agent capability mirrors the Hex reference.** The agent-side milestones
  (v0.8–v0.9, v1.1–v1.3, parts of v2.x) are scoped against the Hex agent's tools
  and behaviors (see `apps/agent/hex_agent_*` notes) — SQL-first, then broaden.
- **Verification is part of "done."** Until v1.0 lands a real test runner, "done"
  still means: `format:check` + `typecheck` + `lint` + `build` (web) and
  `npm run smoke` (agent) all green.

## Icebox 💡 (valuable, but not yet scheduled)

- **Canvas surface** — implement `design/hex-tech/project/Canvas.dc.html` (a
  free-form board of results), a sibling to the notebook.
- **Multi-user & auth** — accounts, per-user threads, sharing / permalinks.
- **More warehouses** — BigQuery / Snowflake / DuckDB connectors on the v0.3
  connector interface.
- **Semantic-layer pre-aggregations** — materialized rollups + caching for the
  v0.4 model (CubeJS's performance layer); correctness ships first.
- **Guardrails & cost controls** — row/byte limits, query timeouts, spend caps.
- **Cross-notebook context** — the agent reading other notebooks/published apps as
  context (Hex `ExploreProjects`); a companion to the notebook track once
  notebooks are common.

> Two former icebox items graduated onto the Thread track: **multiple/specialized
> agents → [v1.2](./v1.2.0-specialized-agents.md)**, and **scheduled refreshes &
> alerts → [v1.3](./v1.3.0-scheduling-alerts.md)**. Observability already shipped
> with v0.1's AI tracing.
