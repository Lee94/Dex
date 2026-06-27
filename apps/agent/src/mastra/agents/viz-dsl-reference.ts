/**
 * Authoring reference for the vinci **surface DSL** (SurfaceDoc) the visualization
 * specialist emits to `build_chart`. Embedded verbatim in that agent's
 * instructions. The web compiles this DSL (`dslToSnapshot`) and renders it with
 * vinci's chart viewer; the in-memory compute aggregates the upstream rows per the
 * encoding. Keep this in sync with apps/web/src/vinci/dsl (the vendored compiler).
 */
export const VIZ_DSL_REFERENCE = `## vinci surface DSL (what you author)

A chart is one JSON object (a "SurfaceDoc"). Shape:

{
  "dslVersion": "1",
  "dataVersion": "10.10.0",
  "name": "<short chart title>",
  "fields": { "<alias>": { "from": "<source column name>", "type": "<type>" }, ... },
  "encoding": { "x": [<field ref>...], "y": [<field ref>...] },
  "geoms": { "<measure alias>": { "type": "<geom>", ... } },
  "settings": {}, "theme": {}
}

- **fields**: declare every column you use. \`from\` = the exact upstream column name; \`type\` ∈
  string | number | decimal | date | datetime. The alias is the key (use the column name as the alias).
- **encoding.x**: the dimension(s) (categories / time). encoding.y: the measure(s).
- **field ref** is either a compact string \`"<alias>:<op>"\` or an object \`{ "field": "<alias>", ... }\`:
  - dimension op = a **group**: \`same\` (categorical, no grouping) or a date grain
    (\`y\`=year, \`m\`=month, \`d\`=day, \`y_m\`=year-month, \`y_m_d\`=year-month-day, \`q\`=quarter, \`w\`=week).
  - measure op = a **summary** (aggregation): \`sum\`, \`avg\`, \`max\`, \`min\`, \`count\`, \`distinct\`, \`median\`.
- **geoms**: keyed by the **measure alias**; \`type\` ∈ \`interval\` (bar/column), \`line\`, \`area\`, \`point\` (scatter).
  There is **no \`pie\` geom** — for part-of-whole, use \`interval\` (bars). Each geom's optional \`options\` keys are
  type-specific and validated strictly (unknown keys are rejected): \`interval\` → \`stack\` (bool) / \`labelPosition\`
  ("inside"|"outside"|"center") / \`roundRadius\` (number); \`line\`/\`area\` → \`stack\` / \`labelPosition\`
  ("top"|"bottom") / \`lineType\` ("normal"|"curve"|"step") (\`line\` also \`marker\` bool); \`point\` → \`labelPosition\`.

### Sorting & top-N

- To **sort**, use a **top-level \`sort\`** array (NOT \`settings.sort\` and NOT a geom \`options.sort\` — those are
  rejected). Each entry sorts a **dimension** by a **measure**:
  \`"sort": [{ "id": "<dimension alias>:same", "sortType": "asc" | "desc", "dependField": "<measure alias>:<summary>" }]\`.
  Example — bars sorted by score descending: \`"sort": [{ "id": "name:same", "sortType": "desc", "dependField": "score:sum" }]\`.
- There is **no row limit / top-N in the DSL** (no \`settings.limit\`). To chart only the top N, add a \`LIMIT\` (with an
  \`ORDER BY\`) to the **upstream SQL result** — the chart renders every row it's given.

### Examples

Bar — count by category:
{
  "dslVersion": "1", "dataVersion": "10.10.0", "name": "Products by category",
  "fields": { "category": { "from": "category", "type": "string" }, "product_count": { "from": "product_count", "type": "number" } },
  "encoding": { "x": ["category:same"], "y": ["product_count:sum"] },
  "geoms": { "product_count": { "type": "interval" } },
  "settings": {}, "theme": {}
}

Line — monthly revenue trend (group a date column by year-month):
{
  "dslVersion": "1", "dataVersion": "10.10.0", "name": "Monthly revenue",
  "fields": { "order_date": { "from": "order_date", "type": "date" }, "revenue": { "from": "revenue", "type": "number" } },
  "encoding": { "x": [{ "field": "order_date", "group": "y_m" }], "y": ["revenue:sum"] },
  "geoms": { "revenue": { "type": "line", "options": { "lineType": "curve", "marker": true } } },
  "settings": {}, "theme": {}
}

Multi-series bars — two measures over one dimension (each series colored via "$metric"):
{
  "dslVersion": "1", "dataVersion": "10.10.0", "name": "Sales vs returns by region",
  "fields": {
    "region": { "from": "region", "type": "string" },
    "sales": { "from": "sales", "type": "number" },
    "returns": { "from": "returns", "type": "number" }
  },
  "encoding": {
    "x": ["region:same"],
    "y": [{ "field": "sales", "summary": "sum" }, { "field": "returns", "summary": "sum" }]
  },
  "geoms": { "sales": { "type": "interval", "color": "$metric" }, "returns": { "type": "interval", "color": "$metric" } },
  "settings": {}, "theme": {}
}

Rules: use exact upstream column names in \`from\`. Pick the geom from the goal — a time series → line; a
comparison across categories → interval (bars); part-of-whole → interval (there is no pie geom). Don't
pre-aggregate in SQL; let the encoding's summary/group do it. Sort via the top-level \`sort\` array; never put
\`sort\`/\`limit\` under \`settings\` or a geom's \`options\` — those are rejected by the compiler.`;
