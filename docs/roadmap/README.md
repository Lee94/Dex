# Dex — Roadmap & version plan

The product-level roadmap for **Dex**, the agentic data-analysis "Threads"
prototype. Each milestone below is a coherent slice of user value; the per-version
files in this folder hold the detail (goal, scope, technical approach, and a
"done when" checklist).

> **Versioning note.** These are **product milestones** for the prototype, tracked
> independently of the per-package npm versions in `apps/*/package.json` (which
> are not bumped in lockstep). Everything pre-`v1.0.0` is still a learning
> prototype — scope and sequencing can change as we learn.

> **Product direction (v3.0): Projects + Threads.** Dex now centers on **two**
> concepts — **Threads** (conversations) and **Projects** (containers that group
> threads and carry shared context). The earlier **notebook** track (v2.0 core
> spike + the deferred v2.1–v2.3 expansion) was **removed/cancelled**: its standalone
> cell editor and all internal machinery (cell document store, `[cell:<id>]`
> embedding, viz-cell persistence, cross-cell chaining) are gone. The agent's
> results stay **inline in the thread** — tables via `ShowSql`/`ShowSemanticTable`,
> charts via the visualization sub-agent (decoupled from the notebook stack). See
> [v3.0.0](./v3.0.0-projects.md).

## Status legend

| Symbol | Meaning              |
| ------ | -------------------- |
| ✅     | Shipped              |
| 🚧     | In progress          |
| 📋     | Planned              |
| 💡     | Icebox (unscheduled) |
| ❌     | Removed / cancelled  |

## Timeline

| Version                                       | Theme                    | Track      | Status            | One-liner                                                                                                        |
| --------------------------------------------- | ------------------------ | ---------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| [v0.1.0](./v0.1.0-threads-mvp.md)             | Threads MVP              | Thread     | ✅ Shipped        | Agentic SQL analyst + Blueprint "Dex" thread UI wired to the live agent.                                         |
| [v0.2.0](./v0.2.0-persistence.md)             | Persistence              | Thread     | ✅ Shipped        | Conversation memory + saved/named threads that survive a refresh.                                                |
| [v0.3.0](./v0.3.0-live-warehouses.md)         | Live warehouses          | Data       | ✅ Shipped        | Real Postgres connections behind a clean connector interface.                                                    |
| [v0.4.0](./v0.4.0-semantic-layer.md)          | Semantic layer           | Data       | ✅ Shipped        | A CubeJS-style model (cubes, measures, dimensions, joins) the agent queries for trusted metrics.                 |
| [v0.5.0](./v0.5.0-richer-results.md)          | Richer results           | Thread     | ✅ Shipped        | Chart-type selection, time-series charts, and table/CSV export on result cards.                                  |
| [v0.6.0](./v0.6.0-data-sources.md)            | Data sources & catalog   | Data       | ✅ Shipped        | A Data browser: register connections, browse schema/tables + previews, explore the model, curate metadata.       |
| [v0.7.0](./v0.7.0-data-management.md)         | Data management          | Data       | ✅ Shipped        | Delete connections, add/delete data models, attach a database/table/model to a question from the composer "+".   |
| [v0.8.0](./v0.8.0-catalog-aware-agent.md)     | Catalog-aware agent      | Thread     | ✅ Shipped        | The agent reads the curated catalog (descriptions/endorsed, honors `includedForAi`) and can list/target sources. |
| [v0.9.0](./v0.9.0-agent-knowledge-memory.md)  | Agent knowledge & memory | Thread     | ✅ Shipped        | Org guides the agent consults + durable cross-thread memory of preferences (+ review suggestions).               |
| [v1.0.0](./v1.0.0-quality-foundation.md)      | Quality foundation       | Foundation | ✅ Shipped        | Automated tests (Vitest / RTL) + CI (GitHub Actions) — the prototype graduates into a tested 1.0 product.        |
| [v1.1.0](./v1.1.0-external-context.md)        | External context         | Thread     | ✅ Shipped        | Web search/extract + reading uploaded files — Thread mode reaches beyond the warehouse.                          |
| [v1.2.0](./v1.2.0-specialized-agents.md)      | Specialized agents       | Thread     | ✅ Shipped        | A planner + specialist sub-agents (data discovery, visualization) the analyst delegates to.                      |
| [v1.3.0](./v1.3.0-scheduling-alerts.md)       | Scheduling & alerts      | Thread     | ✅ Shipped        | Scheduled re-runs with email/Slack delivery + alerts, and recall across past threads.                            |
| [v2.0.0](./v2.0.0-notebook-editor.md)         | NotebookEditor           | Notebook   | ❌ Removed (v3.0) | The cell-based notebook + Hex agent model. Shipped as a spike, then removed in the v3.0 pivot.                   |
| [v2.1.0](./v2.1.0-richer-cells.md)            | Richer cells & cell ops  | Notebook   | ❌ Cancelled      | Superseded by the v3.0 pivot to Projects + Threads.                                                              |
| [v2.2.0](./v2.2.0-charts-and-viz.md)          | Charts & viz             | Notebook   | ❌ Cancelled      | Superseded by the v3.0 pivot; charts now render inline in the thread.                                            |
| [v2.3.0](./v2.3.0-python-kernel.md)           | Python & kernel          | Notebook   | ❌ Cancelled      | Superseded by the v3.0 pivot.                                                                                    |
| [v3.0.0](./v3.0.0-projects.md)                | Projects + Threads pivot | Thread     | ✅ Shipped        | Remove the notebook; introduce Projects (thread containers with shared context). Charts kept, decoupled.         |
| [v3.1.0](./v3.1.0-result-grid.md)             | Interactive result grid  | Thread     | ✅ Shipped        | Sort/filter/progressive-paged result grid + a fullscreen Modal; removed the inert buttons.                       |
| [v3.2.0](./v3.2.0-conversational-controls.md) | Conversational controls  | Thread     | ✅ Shipped        | Edit/resend, regenerate, retry-on-error, and result-derived suggested follow-ups.                                |
| [v3.3.0](./v3.3.0-editable-viz.md)            | Editable charts          | Thread     | ✅ Shipped        | NL "edit in words" (re-delegates to the viz sub-agent) + chart export (SVG/CSV). Designer direct-edit deferred.  |
| [v3.4.0](./v3.4.0-pin-and-report.md)          | Pinning & reports        | Thread     | ✅ Shipped        | Pin results/charts into a read-only report; reorder, Markdown export, copy-link Share.                           |
| [v3.5.0](./v3.5.0-collaboration.md)           | Collaboration            | Collab     | 📋 Planned        | Identity + permissions, comments/@mentions, permissioned sharing (strategic; split into sub-milestones).         |

The **Thread** track is the product. The **Notebook** track (v2.x) was a spike that
the **v3.0 pivot retired** in favor of **Projects** (thread containers with shared
context) — see [v3.0.0](./v3.0.0-projects.md). The **v3.1–v3.5** plan then closes
the gap to Hex on the _post-answer_ experience: the agent's "question → answer"
path is strong, but results are currently inert (no grid interaction, no rework,
read-only charts, nothing durable/shareable). These versions are sequenced by ROI
— front-end-only wins first (v3.1), then conversation rework (v3.2) and chart
editing (v3.3), then durable artifacts (v3.4), and finally collaboration (v3.5).

> **Verification note (v3.1–v3.4).** The agent-side changes (the v3.4 pins store +
> `/reports` routes) are typechecked and unit-tested locally. The web-side changes
> couldn't be built in the authoring sandbox (the `@vinci/*` packages need the
> private `npm.fineres.com` registry token, absent there), so web `typecheck` /
> `build` / Vitest must be confirmed in CI, where the token is available. The
> changes were written against the existing types/patterns and reviewed by hand.

## How the milestones build on each other

```
THREAD MODE (the center)
  v0.1 MVP ─► v0.2 persistence ─► v0.3 warehouses ─► v0.4 semantic layer
       ├─► v0.5 richer results (result-card viz + export)
       └─► v0.6 catalog ─► v0.7 data management
              └─► v0.8 catalog-aware agent ─► v0.9 knowledge & memory
                     └─► v1.0 tests + CI
                            └─► v1.1 external context ─► v1.2 specialized agents ─► v1.3 scheduling
                                   └─► v3.0 Projects + Threads pivot
                                          └─► v3.1 result grid ─► v3.2 conversational controls
                                                 └─► v3.3 editable viz ─► v3.4 pinning & reports
                                                        └─► v3.5 collaboration

NOTEBOOK (v2.x) ─ removed/cancelled in the v3.0 pivot
```

The **v3.1–v3.5** arc hardens the _post-answer_ thread experience against the Hex
reference: interactive grids (v3.1), reworkable conversations (v3.2), editable
charts/tables (v3.3), durable & shareable reports (v3.4), and multi-user
collaboration (v3.5). v3.1–v3.3 are largely front-end and reuse the existing
vinci stack (`@vinci/viewer`/`@vinci/designer`) without touching the agent stream
contract; v3.4 reintroduces a lightweight persistence layer (not the retired
notebook); v3.5 is the strategic multi-user track.

The plan leads with **features**, then hardens. **v0.2–v0.4** make Dex a real,
data-backed product; **v0.5** sharpens the payoff (better results); **v0.6–v0.7**
turn data sources into a managed catalog. **v0.8–v0.9** then make the _agent_ use
that catalog and carry durable knowledge, and **v1.1–v1.3** extend its reach
(web/files, sub-agents, scheduling) — the Thread-mode agent track, scoped against
the Hex agent reference. **v1.0** pays down deferred engineering (a test runner and
CI). **v3.0** then pivots the product to **Projects + Threads**, retiring the
**notebook** spike (**v2.0**) and its planned expansion (**v2.1–v2.3**).

## Guiding principles

- **Projects + Threads.** The conversational analyst is the product's center;
  Projects organize threads and give them shared context. (The notebook track was
  retired in v3.0.)
- **Prototype discipline, not enterprise scope.** Each version is the smallest
  thing that delivers the theme. Defer aggressively; record deferrals in each
  doc's _Out of scope_ section.
- **Don't regress the contract.** The web↔agent contract (the `analyst` registry
  key, the Mastra stream the UI maps) and the read-only SQL guard
  (`assertReadOnly`) hold across versions.
- **The design handoff informed the UI.** `design/hex-tech/project/` holds the
  original handoff surfaces — `Notebook.dc.html` (the app shell, v0.1) and
  `NotebookEditor.dc.html` (the cell editor, retired in v3.0). The Projects UI is
  built on the same `--dex-*` token system + `components/ui` primitives.
- **Agent capability mirrors the Hex reference.** The agent-side milestones
  (v0.8–v0.9, v1.1–v1.3) are scoped against the Hex agent's tools and behaviors
  (see `apps/agent/hex_agent_*` notes) — SQL-first, then broaden.
- **Verification is part of "done."** Until v1.0 lands a real test runner, "done"
  still means: `format:check` + `typecheck` + `lint` + `build` (web) and
  `npm run smoke` (agent) all green.

## Icebox 💡 (valuable, but not yet scheduled)

- **Canvas surface** — implement `design/hex-tech/project/Canvas.dc.html` (a
  free-form board of results). _(v3.4 ships an ordered report/pin list; the
  free-form board stays icebox.)_
- **More warehouses** — BigQuery / Snowflake / DuckDB connectors on the v0.3
  connector interface.
- **Semantic-layer pre-aggregations** — materialized rollups + caching for the
  v0.4 model (CubeJS's performance layer); correctness ships first.
- **Guardrails & cost controls** — row/byte limits, query timeouts, spend caps.
- **Cross-project context** — the agent reading other projects' threads/results as
  reference context (Hex `ExploreProjects`).

> Former icebox items that graduated onto the Thread track: **multiple/specialized
> agents → [v1.2](./v1.2.0-specialized-agents.md)**, **scheduled refreshes &
> alerts → [v1.3](./v1.3.0-scheduling-alerts.md)**, and **multi-user & auth →
> [v3.5](./v3.5.0-collaboration.md)** (sharing/permalinks start in
> [v3.4](./v3.4.0-pin-and-report.md)). Observability already shipped with v0.1's
> AI tracing.
