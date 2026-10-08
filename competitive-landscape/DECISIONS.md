# Decisions

Significant choices made while building the MVP, with the reason for each.

## Project and tooling

- **Location.** The repository held only a README and a .gitignore, so the app
  lives in `competitive-landscape/` as the brief specifies. The repo root keeps
  the overview README.
- **Versions.** The newest majors (Vite 8, TypeScript 7, Vitest 5) were not used.
  Pinned instead: Vite 7.3.7, React 19.2.8, TypeScript 5.9.3, Vitest 4.1.11,
  Zod 4.1.13, Dexie 4.2.1, @playwright/test 1.56.1. Vitest 3.x was dropped
  because `npm audit` flagged its tinypool/mocker advisories; 4.1.11 audits
  clean. Playwright is pinned to the Chromium build preinstalled in the
  environment.
- **`overrides.vite = "$vite"`** in package.json works around an npm 10 arborist
  crash (`Cannot read properties of null (reading 'edgesOut')`). npm hit it
  while resolving Vitest's optional `vite@^8` peer chain. The override keeps one
  Vite version and does not change behaviour.
- **No jsdom.** Domain, persistence (fake-indexeddb) and scene tests run in
  Node. UI behaviour is covered by Playwright against the production build
  (`vite preview`). The latest jsdom also requires a newer Node patch than the
  one installed.
- **Code splitting.** Export code (which needs `react-dom/server`) and Zod
  import validation load on first use. That keeps the main bundle at about
  424 kB minified (138 kB gzip).

## Data and validation

- **Incomplete vs invalid.** Drafts are always saved. A competitor missing a
  name, SAM or segment is *excluded* from analysis, with a visible reason, so
  projects can grow progressively. Any *invalid* value blocks analysis:
  SAM ≤ 0 or > TAM, SOM < 0 or > SAM, a custom split not totalling 100%,
  dangling references, non-http(s) URLs, or modelled union > TAM. The last
  valid snapshot is then shown, labelled "Not current". An incomplete IDV
  blocks analysis.
- **Missing description** is a warning, not a blocker; it does not affect the
  numbers.
- **Unparseable text** (e.g. `abc` in SAM) cannot be stored as a number. The form
  keeps the text, explains the problem and refuses to save until it is fixed.
  Numeric but invalid values *can* be saved as drafts.
- **Markup in user text** (tag-like `<...>` or script URLs) is flagged at entry
  as a validation error and rejected on import. The text is always rendered
  escaped, but flagging it at entry guarantees that every saved project can
  round-trip through JSON import, which must reject executable markup.
- **IDs** are time-ordered (`prefix_<base36 ms><seq><random>`), so stable-ID
  order equals creation order. The default map anchor (earliest-created
  competitor) therefore never changes when products are added later.
- **Import** always creates a new project with a new project ID. Product,
  segment and source IDs are kept so the file round-trips exactly, and
  `(imported)` is appended when the name already exists. An exported layout is
  stored as a snapshot and used only if its input hash matches the re-analysis.
- **Drafts vs snapshots.** IndexedDB has two tables: `projects` holds the
  editable draft; `snapshots` holds a copy of the inputs at the last valid
  analysis plus the fitted layout. The layout is keyed by an input hash (cyrb53
  of a stable JSON of the analysis inputs, anchor and seed). Worker replies are
  dropped unless their job ID is the newest *and* their hash matches the
  current inputs.
- **Persisting the anchor** is a "housekeeping" write: it does not bump the
  revision or the last-modified time, because it does not change the inputs.

## Model and charts

- **Distance snapping.** `1 − G ≤ 1e-12` is reported as distance 0, so identical
  footprints are exactly 0 despite rounding.
- **Coincident competitors share one angle variable** in the optimiser. They
  land on exactly the same point and become a selectable stack, with no jitter.
- **Map error over all pairs** includes the IDV–competitor pairs, as the brief's
  formula says. Their residuals are 0 because radii are exact.
- **Crowding thresholds:** at least 50% of competitors present means "More
  crowded"; at most 25% means "Less covered in this comparison". Labels need at
  least 3 competitors. Groups also need at least 3 directional competitors;
  otherwise pair relationships are listed.
- **Colours.** The validated dataviz reference palette (8 hues, light mode) is
  assigned by stable ID order and follows the entity. Competitors beyond the
  eighth use a neutral grey. The IDV is an ink star, not a bigger marker. On
  the map only three hues are separable for every colour-vision type, so every
  product is also labelled directly or keyed by number. Export legends always
  carry the keyed list, except in the clean variant when every name is shown
  directly. Text never uses the data colour.
- **One scene, two renderers.** Charts are built as pure scenes of SVG
  primitives. The same `SceneSvg` React component renders them on screen and,
  through `renderToStaticMarkup`, into SVG, PNG and report exports, so exported
  geometry is identical to what is on screen.
- **Label placement** is greedy and deterministic: 8 directions × increasing
  offsets, with leader lines at larger offsets. If no space exists, the label
  falls back to its key number, and finally to an overlapping label. Text width
  is estimated per character class; no DOM measurement is needed, so exports
  can be built off-screen.
- **Export presets:** landscape 1920×1080; distance chart 1920 wide, with
  height growing past 1080 only when rows need it. The report uses a
  content-height distance chart. PNGs are rasterised from the SVG on a canvas
  with an opaque white background.
- **Light theme only.** Exports are on white, and the app uses the same light
  palette. No dark mode in this MVP.
- **Citations in the app** are buttons, not `#anchor` links, because the app uses
  hash routing. The HTML report uses real anchors.

## Claude Artifact build

- **One codebase, two targets.** `vite build --mode artifact` sets
  `IS_ARTIFACT`. `scripts/assemble-artifact.mjs` then inlines the CSS and the
  single JS chunk into page content (the publisher adds the document
  skeleton), escaping `</script` and `<!--` inside the bundle. The layout
  worker is published next to the page, because the inlined bundle resolves
  it against the page URL.
- **Storage backends.** One interface with three implementations. *Account*:
  the `db` capability, each viewer's projects as `p_<id>` and snapshots as
  `s_<id>` in their private `data/users/<uid>` collection, with writes to a
  document serialised and refused writes explained. *Browser*: Dexie.
  *Memory*: the last resort. The standalone app always uses the browser
  backend.
- **Exports** go through the `downloads` capability. The viewer confirms each
  save; a declined save is reported, never retried.
- **Viewer constraints.** In-memory routing, because only plain `#anchors`
  reach an artifact. In-page two-step confirmations replace `confirm()`, which
  the viewer blocks; the standalone app uses them too. If the worker fails to
  start, layout falls back to the main thread.
- **Theme.** All colours are tokens with light and dark values. On-screen
  charts map palette hexes to CSS variables (`SceneSvg themed`). Exports keep
  literal colours on white.
- **First view.** With no saved projects, the Projects page shows a live,
  clearly labelled preview of the fictional example.

## Not built (by design)

No accounts, server, LLM, web research, scraping, payments, or deployment. No
feature weights, choice-share, adoption or forecasting. These are listed as
future work in the methodology.
