# Blueprint Design System

A faithful, self-contained recreation of **Blueprint** — the open-source React UI toolkit by Palantir Technologies — packaged as a design system for generating well-branded interfaces, prototypes, and assets.

Blueprint is optimized for building **complex, data-dense desktop web interfaces** (think analytics platforms, internal tooling, dashboards). It is *not* a mobile-first or marketing-site toolkit. Everything here reflects that: tight spacing, a neutral gray foundation, a single confident blue, subtle elevation, and a 500+ icon set tuned for information density.

## Sources

This system was reconstructed from the official Blueprint open-source repository. Explore these to go deeper or pull in more components/icons:

- **GitHub:** https://github.com/palantir/blueprint (read at branch `develop`, the BP6 line)
  - Design tokens: `packages/core/src/design-tokens/tokens/` (palette, intent, surface, typography)
  - Color palette: `packages/colors/src/_colors.scss`
  - Sass variables: `packages/core/src/common/_variables.scss`, `_color-aliases.scss`
  - Components: `packages/core/src/components/`
  - Icons (700+ SVGs): `resources/icons/16px/` and `resources/icons/20px/`
- **Docs:** https://blueprintjs.com/docs/
- **Icon CDN (full set):** `@blueprintjs/icons` on npm/unpkg/jsDelivr

> Tokens, the exact palette, intent mappings, elevation shadows, and the icon SVGs were lifted directly from the repo so values are accurate. Components are simplified, cosmetic React recreations (not the production implementations) that read the same CSS custom properties.

---

## CONTENT FUNDAMENTALS

Blueprint products speak the language of **professional tools for expert users**. Copy is functional, precise, and unsentimental — it respects that the reader is an analyst or operator getting work done.

- **Tone:** Direct, neutral, confident. No marketing fluff, no exclamation marks, no cuteness. Describe what a thing *does*, not how exciting it is.
- **Voice / person:** Address the user as **you** ("Search everything…", "Pick a dataset"). System actions are stated plainly ("Background sync enabled"). Avoid "we".
- **Casing:** **Sentence case** everywhere — buttons, menu items, headers, dialog titles ("New dataset", "Create a new dataset", not "New Dataset"). Reserve UPPERCASE for tiny section-label eyebrows (letter-spaced, muted, ~11px).
- **Labels:** Short, verb-first for actions ("Export", "View lineage", "Build graph"). Nouns for objects ("Schema", "Lineage", "History").
- **Helper / validation text:** Concrete and corrective ("Lowercase letters, numbers and underscores only", "Enter a valid address"). Use intent color to signal state.
- **Numbers & metadata:** Surface real, scannable figures with units ("2.41M rows", "18 columns", "4m ago"). Data density is a feature, not clutter — but every number must mean something.
- **Empty / error states:** A calm one-line title plus a one-sentence next step ("No datasets found" → "Try a different filter or import a new source").
- **Emoji:** **None.** Blueprint never uses emoji. Meaning is carried by its icon set and intent colors.
- **Vibe:** Mission-control for data. Trustworthy, dense, efficient. The UI gets out of the way.

---

## VISUAL FOUNDATIONS

### Color
- **Neutral-first.** The interface is built on a 17-step grayscale ramp (`--bp-palette-black` → `--bp-palette-white`). Light theme apps sit on `light-gray-5` (#f6f7f9) with white surfaces; dark theme sits on `dark-gray-1` with `dark-gray-3` surfaces.
- **One primary: blue.** `--bp-intent-primary-rest` = #2d72d2 (blue-3). It carries nearly all emphasis — primary buttons, active tabs, links, selection.
- **Four intents:** primary (blue), success (green #238551), warning (orange #c87619), danger (red #cd4246). Each has `rest → hover → active → disabled → foreground`. **BP6 pattern: colors get *darker* on hover** (toward palette index 1), not lighter.
- **Extended palette** (vermilion, rose, violet, indigo, cerulean, turquoise, forest, lime, gold, sepia) is reserved for **categorical data visualization**, not UI chrome.
- **Warning** uses near-black foreground text (orange is perceptually bright); all other intents use white foreground.

### Type
- **Native system font stack** — `system-ui, -apple-system, BlinkMacSystemFont, sans-serif`. **No webfonts**; Blueprint deliberately renders in the OS UI font for speed and native feel. `system-ui` resolves per-platform to Segoe UI (Windows), San Francisco (macOS/iOS), Roboto (Android), Oxygen/Cantarell (Linux), so no named family or `@font-face` is needed.
- **Monospace** for code, IDs, schema names, and raw values.
- **Default body is 14px** (`--bp-font-size-body-medium`), line-height 1.28581 — compact for density. Sizes: 10 / 12 / 14 / 16 body; 16 / 20 / 24 / 28 / 46 headings.
- **Headings are weight 600** (not 700), tight line-height (~1.2). Body is 400. Bold = 600.

### Spacing & layout
- **4px base grid** (`--bp-surface-spacing`). All padding, margins, and component sizing are multiples of 4. Buttons/inputs are 30px tall (small 24, large 40); the navbar is 50px.
- Layouts are **dense and rectangular** — fixed navbars, fixed side panels, scrollable centers. Multi-pane (sidebar / main / detail) is the canonical app shell.

### Shape & depth
- **Corner radius is small: 4px** (`--bp-surface-border-radius`) on virtually everything; pills only for tags/toggles. Sharp, businesslike — never pillowy.
- **Borders are simulated with `box-shadow`, not `border`** (so they stack with drop shadows and don't shift layout). The signature look: a **1px inset ring** plus a soft drop shadow.
- **Five elevation levels** (`--bp-surface-shadow-0`…`4`): level 0 is a flat 1px ring; higher levels add progressively larger drop shadows for cards, popovers (3), and dialogs (3–4).
- **Inputs** carry an inset border shadow (`--bp-input-box-shadow`) that reads as a recessed field; on focus they gain a blue ring.

### Cards
- White surface, **4px radius**, padding 20px (compact 10px), elevation-0 ring by default. `interactive` cards lift one elevation level and translate up 1px on hover. Selected cards show a 1px primary ring.

### Motion
- **Fast and restrained.** `--bp-transition-duration` = **100ms**, easing `cubic-bezier(0.4, 1, 0.75, 0.9)`. A subtle bounce easing exists for playful affordances but is rarely used. Transitions apply to background, box-shadow, and color — **no decorative or looping animation**, no parallax, no gradients-in-motion.

### Interaction states
- **Hover:** surfaces *darken* slightly (default buttons tint toward gray; intent buttons step to their `hover` token). Minimal buttons gain a faint translucent wash.
- **Active/press:** darken further (to the `active` token); no scale-down. Pressed default buttons deepen the inset shadow.
- **Focus:** a blue focus ring (`--bp-focus-indicator-color`) for keyboard accessibility.
- **Disabled:** muted color + reduced opacity, `cursor: not-allowed`, shadow removed.

### Backgrounds & imagery
- **No photographic or illustrative backgrounds** in product UI. Surfaces are solid neutral fills. No gradients in chrome (the only "gradient" is a CSS trick for stacking translucent intent tints). No textures, no grain, no glassmorphism/blur in standard components (overlays use a flat 70% black scrim).
- Data visualization is where color and shape come alive — that's the intended canvas for the extended palette.

---

## ICONOGRAPHY

Blueprint ships its **own icon set** — 500+ pixel-crafted UI icons designed in-house, available at **16px** and **20px** grids. This is a core part of the brand identity.

- **Format:** Monochrome **SVG**, single-color, drawn on a 16×16 (or 20×20) grid. They inherit color via `currentColor` so they tint to match text/intent automatically.
- **In this system:** 68 of the most common icons are bundled as inline SVG paths in `components/icon/iconPaths.js`, exposed through the `<Icon>` component (`<Icon icon="search" />`, `<Icon icon="tick-circle" intent="success" />`). The full 500+ set lives in the source repo under `resources/icons/16px/` and `resources/icons/20px/` — import more SVGs as needed, or load `@blueprintjs/icons` from a CDN.
- **Style:** Functional, consistent 2px-ish stroke weight rendered as filled shapes, optically balanced. Domain-rich: alongside generic UI icons (search, cog, more) there are data/geo/graph icons (database, th, heat-grid, geosearch, path-search, timeline-line-chart, layers, globe, map-marker) that reflect Blueprint's analytics heritage.
- **Usage:** Icons appear in buttons, inputs (left icon), menu items, tabs, navbars, tags, and non-ideal states. Standard size in UI is **16px**; 20px for emphasis. Color defaults to muted gray (`--bp-icon-color`); intent icons take their intent color.
- **No emoji, no Unicode-glyph icons, no second icon library.** The Blueprint set is the single source.

See the **Icon — Blueprint UI icon set** card in the Design System tab for the full bundled gallery.

---

## INDEX / MANIFEST

### Root
- `styles.css` — the single entry point consumers link. `@import`s every token file. **(compiler entry)**
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skill front matter for use in Claude Code.

### Tokens (`tokens/`)
- `palette.css` — raw color ramps (`--bp-palette-*`): grayscale, core intents, extended hues.
- `colors.css` — semantic intents, surfaces, text, borders, focus, code + **dark theme** overrides.
- `typography.css` — font families, size scale, weights, line-heights.
- `spacing.css` — 4px spacing scale, radius, component dimensions, z-index, **elevation shadows**, motion.
- `base.css` — reset + running-text styles (headings, links, code, dividers).

### Components (`components/`) — `window.BlueprintDesignSystem_0b99aa`
- `icon/` — **Icon** (+ `ICON_PATHS`, `ICON_NAMES`)
- `core/` — **Button, Tag, Card, Callout, Divider, Spinner, ProgressBar**
- `forms/` — **InputGroup, Checkbox, Switch, HTMLSelect, FormGroup**
- `navigation/` — **Navbar** (+ Group/Heading/Divider), **Tabs, Menu** (+ MenuItem/MenuDivider)
- `feedback/` — **Dialog, NonIdealState, Tooltip**

Each directory has a `.card.html` thumbnail, and each component a `.d.ts` (props) + `.prompt.md` (usage).

### Foundation cards (`guidelines/`)
Specimen cards for the Design System tab — Colors (grayscale, intents, extended, intent states, text/surface), Type (headings, body, code), Spacing (scale, radius, elevation), Brand (wordmark).

### UI kits (`ui_kits/`)
- `data-workbench/` — a Foundry-style data-catalog workspace (navbar, tree, data table, schema, detail panel, create-dataset dialog) composed from the primitives. Interactive. See its `README.md`.

### Assets (`assets/`)
- `logo-wordmark.svg` — an **original** wordmark for this recreation (Palantir/Blueprint trademarks are intentionally not reproduced).
- `resources/icons/16px/*.svg` — 68 imported Blueprint source icons (data for the Icon component).

---

## Caveats
- **Fonts:** Blueprint uses the **native system font stack on purpose** (via the `system-ui` generic) — there are no webfont files to upload.
- **Components are cosmetic recreations**, simplified from the production Blueprint source; they cover the common props and states, not every edge case.
- **Logo:** the wordmark is original to avoid reproducing Palantir's trademarks.
