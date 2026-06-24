# Dex — Roadmap & version plan

The product-level roadmap for **Dex**, the agentic data-analysis "Threads"
prototype. Each milestone below is a coherent slice of user value; the per-version
files in this folder hold the detail (goal, scope, technical approach, and a
"done when" checklist).

> **Versioning note.** These are **product milestones** for the prototype, tracked
> independently of the per-package npm versions in `apps/*/package.json` (which
> are not bumped in lockstep). Everything pre-`v1.0.0` is still a learning
> prototype — scope and sequencing can change as we learn.

## Status legend

| Symbol | Meaning              |
| ------ | -------------------- |
| ✅     | Shipped              |
| 🚧     | In progress          |
| 📋     | Planned              |
| 💡     | Icebox (unscheduled) |

## Timeline

| Version                                  | Theme                  | Status     | One-liner                                                                                                               |
| ---------------------------------------- | ---------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| [v0.1.0](./v0.1.0-threads-mvp.md)        | Threads MVP            | ✅ Shipped | Agentic SQL analyst + Blueprint "Dex" thread UI wired to the live agent; eng pass.                                      |
| [v0.2.0](./v0.2.0-persistence.md)        | Persistence            | ✅ Shipped | Conversation memory + saved/named threads that survive a refresh.                                                       |
| [v0.3.0](./v0.3.0-live-warehouses.md)    | Live warehouses        | ✅ Shipped | Real Postgres connections behind a clean connector interface.                                                           |
| [v0.4.0](./v0.4.0-semantic-layer.md)     | Semantic layer         | ✅ Shipped | A CubeJS-style model (cubes, measures, dimensions, joins) the agent queries for trusted, consistent metrics.            |
| [v0.5.0](./v0.5.0-richer-results.md)     | Richer results         | 📋 Planned | Chart-type selection, time-series charts, and table/CSV export.                                                         |
| [v0.6.0](./v0.6.0-data-sources.md)       | Data sources & catalog | ✅ Shipped | A Data browser: register connections, browse schema/tables/columns + real previews, explore the model, curate metadata. |
| [v0.7.0](./v0.7.0-data-management.md)    | Data management        | ✅ Shipped | Delete connections, add/delete data models, and attach a database/table/model to a question from the composer's "+".    |
| [v1.0.0](./v1.0.0-quality-foundation.md) | Quality foundation     | 📋 Planned | Automated tests (Vitest / RTL) + CI (GitHub Actions) — the prototype graduates into a real, tested 1.0 product.         |
| [v2.0.0](./v2.0.0-notebook-editor.md)    | NotebookEditor         | 📋 Planned | The full cell-based notebook editor — Dex becomes a notebook, not just a thread chat; the first major leap past 1.0.    |

## How the milestones build on each other

```
v0.1  Threads MVP ───► v0.2  persistence (threads survive refresh)
                          └──► v0.3  live warehouses (real connections)
                                 └──► v0.4  semantic layer (CubeJS-style)
                                        ├──► v0.5  richer results (viz + export)
                                        └──► v0.6  data sources & catalog (browse + curate)
                                               └──► v0.7  data management (delete sources, CRUD models, composer "+")
                                                      └──► v1.0  tests + CI (prototype → product)
                                                             └──► v2.0  NotebookEditor
```

The plan leads with **features**, then hardens: **v0.2** makes it feel like a real
product (your work persists), **v0.3** points Dex at real data sources, **v0.4**
models that data into a CubeJS-style semantic layer so answers use trusted,
consistent metrics, and **v0.5** sharpens the payoff (better answers to look at —
chart types and export). **v1.0** then pays down the deferred engineering — a real
test runner + CI — graduating the prototype into a tested, production-solid product.
The biggest bet, the full notebook surface (**v2.0**), is the next major leap on top
of that foundation.

## Guiding principles

- **Prototype discipline, not enterprise scope.** Each version is the smallest
  thing that delivers the theme. Defer aggressively; record deferrals in each
  doc's _Out of scope_ section.
- **Don't regress the contract.** The web↔agent contract (the `analyst` registry
  key, the Mastra stream the UI maps) and the read-only SQL guard
  (`assertReadOnly`) hold across versions.
- **The design handoff leads the UI.** `design/hex-tech/project/` has three
  surfaces — `Notebook.dc.html` (shipped in v0.1), `NotebookEditor.dc.html`
  (v2.0), and `Canvas.dc.html` (icebox). New UI maps back to these.
- **Verification is part of "done."** Until v1.0 lands a real test runner,
  "done" still means: `format:check` + `typecheck` + `lint` + `build` (web) and
  `npm run smoke` (agent) all green.

## Icebox 💡 (valuable, but not yet scheduled)

- **Canvas surface** — implement `design/hex-tech/project/Canvas.dc.html` (a
  free-form board of results), a sibling to the notebook.
- **Multi-user & auth** — accounts, per-user threads, sharing / permalinks.
- **More warehouses** — BigQuery / Snowflake / DuckDB connectors once the
  connector interface (v0.3) exists.
- **Semantic-layer pre-aggregations** — materialized rollups + caching for the
  v0.4 model (CubeJS's performance layer); correctness ships first.
- **Multiple / specialized agents** — e.g. a planner + a SQL specialist, or
  per-domain analysts.
- **Guardrails & cost controls** — row/byte limits, query timeouts, spend caps.
- **Scheduled refreshes & alerts** — re-run a saved thread on a cron, notify on
  change.
- **Observability** — surface Mastra telemetry (token/latency/tool traces) in a
  dev panel.
