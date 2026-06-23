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

| Version                                  | Theme              | Status     | One-liner                                                                             |
| ---------------------------------------- | ------------------ | ---------- | ------------------------------------------------------------------------------------- |
| [v0.1.0](./v0.1.0-threads-mvp.md)        | Threads MVP        | ✅ Shipped | Agentic SQL analyst + Blueprint "Dex" thread UI wired to the live agent; eng pass.    |
| [v0.2.0](./v0.2.0-quality-foundation.md) | Quality foundation | 📋 Planned | Automated tests (Vitest / RTL) + CI (GitHub Actions). The deferred engineering work.  |
| [v0.3.0](./v0.3.0-persistence.md)        | Persistence        | 📋 Planned | Conversation memory + saved/named threads that survive a refresh.                     |
| [v0.4.0](./v0.4.0-richer-results.md)     | Richer results     | 📋 Planned | Chart-type selection, time-series charts, and table/CSV export.                       |
| [v0.5.0](./v0.5.0-live-warehouses.md)    | Live warehouses    | 📋 Planned | Real Postgres connections behind a connector interface + an endorsed/semantic layer.  |
| [v1.0.0](./v1.0.0-notebook-editor.md)    | NotebookEditor     | 📋 Planned | The full cell-based notebook editor — Dex becomes a notebook, not just a thread chat. |

## How the milestones build on each other

```
v0.1  Threads MVP ───► v0.2  tests + CI (iterate safely)
                          └──► v0.3  persistence (threads survive refresh)
                                 └──► v0.4  richer results (viz + export)
                                        └──► v0.5  live warehouses + semantic layer
                                               └──► v1.0  NotebookEditor
```

The early steps are deliberately small and high-leverage: **v0.2** makes the
prototype safe to change, **v0.3** makes it feel like a real product (your work
persists), and **v0.4** sharpens the payoff (better answers to look at). The
bigger bets — real data sources (**v0.5**) and the full notebook surface
(**v1.0**) — come once the foundation is solid.

## Guiding principles

- **Prototype discipline, not enterprise scope.** Each version is the smallest
  thing that delivers the theme. Defer aggressively; record deferrals in each
  doc's _Out of scope_ section.
- **Don't regress the contract.** The web↔agent contract (the `analyst` registry
  key, the Mastra stream the UI maps) and the read-only SQL guard
  (`assertReadOnly`) hold across versions.
- **The design handoff leads the UI.** `design/hex-tech/project/` has three
  surfaces — `Notebook.dc.html` (shipped in v0.1), `NotebookEditor.dc.html`
  (v1.0), and `Canvas.dc.html` (icebox). New UI maps back to these.
- **Verification is part of "done."** Until v0.2 lands a real test runner,
  "done" still means: `format:check` + `typecheck` + `lint` + `build` (web) and
  `npm run smoke` (agent) all green.

## Icebox 💡 (valuable, but not yet scheduled)

- **Canvas surface** — implement `design/hex-tech/project/Canvas.dc.html` (a
  free-form board of results), a sibling to the notebook.
- **Multi-user & auth** — accounts, per-user threads, sharing / permalinks.
- **More warehouses** — BigQuery / Snowflake / DuckDB connectors once the
  connector interface (v0.5) exists.
- **Multiple / specialized agents** — e.g. a planner + a SQL specialist, or
  per-domain analysts.
- **Guardrails & cost controls** — row/byte limits, query timeouts, spend caps.
- **Scheduled refreshes & alerts** — re-run a saved thread on a cron, notify on
  change.
- **Observability** — surface Mastra telemetry (token/latency/tool traces) in a
  dev panel.
