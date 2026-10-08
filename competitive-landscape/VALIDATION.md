# Validation record

Run on Linux, Node 22.22.0, npm 10.9.4, Chromium 141 (Playwright 1.56.1
bundle), on 2026-10-08.

## Gates

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc -b`, strict, app + tests/e2e configs) | pass, 0 errors |
| `npm run test` (Vitest) | **76 passed**, 5 files |
| `npm run build` (`tsc -b && vite build`) | pass; main chunk ≈424 kB (≈138 kB gzip), plus lazy `exports` and `schema` chunks and the layout worker |
| `npm run e2e` (Playwright, Chromium, against `vite preview` of the production build) | **2 passed** |
| `npm audit` | 0 vulnerabilities |

## Unit and domain tests (`tests/`)

- `model.test.ts` (27). Tiny fixture from the brief: identical → 0, disjoint →
  1, SAM-30-in-P → overlap 30, exposures 30% / 100%, d = 0.6725157563.
  Demo distances, union 750,000 and SAM sum 1,600,000, against hand
  calculation. Exact stored fractions and display-only formatting. Symmetry,
  bounds, finiteness and exact diagonals on seeded random fixtures. Direct
  formula vs the explicit threshold-vector construction. Union and group
  overlap without double counting. Union > TAM flagged with no data mutation;
  SAM sum > TAM allowed. Equal/custom splits, with custom splits never reset.
  Native angles vs the angle measured in the high-dimensional embedding.
  Input-order invariance, including identical input hashes.
- `layout.test.ts` (15). Plotted radii equal native IDV distances (error
  < 1e-12). Anchor fixed at 0 and stable when products are added. A triangle
  reproduced with ~0 error. Residuals, relative RMS, max error and worst pair
  checked against an independent recomputation. Best of 12 starts ≤ single
  start. Determinism. Warm start and reflection alignment. 50 products ×
  30 segments within budget. Degenerate cases: IDV only, one competitor, all
  distances 0, disjoint and equal radii, coincident stacks without jitter.
  Segment centres: midpoint and convex-hull checks; no marker for zero weight.
- `context.test.ts` (13). Price comparability: annual ÷ 12, basis, currency,
  free vs quote vs unknown. Blank SOM stays unknown. Incomplete drafts
  excluded; invalid SAM/SOM blocked with useful messages. Narrative sections,
  facts and forbidden claims. Markup flagged at entry.
- `persistence.test.ts` (14), on fake-indexeddb. Drafts and last-valid
  snapshots stored separately. The example never overwrites projects. `add`
  never overwrites. JSON round-trip preserves inputs, IDs, settings and model
  version, imports as a new project, and carries the layout cache. Rejections:
  future schema (useful message), non-project files, non-finite numbers,
  dangling IDs, malformed allocations, markup, non-http URLs, oversized files,
  unknown fields; a rejected import leaves storage unchanged. Stale worker
  results are dropped after a newer request; worker errors surface.
- `scenes.test.ts` (7). Demo and 40-product exports contain every product name,
  as a direct label or in the keyed list, in both the export and clean
  variants. All export text stays inside 1920×1080. The distance chart lists
  every competitor, its exact value and the fixed 0–1 ticks. Narrow screen
  scenes stay finite.

## Browser journey (`e2e/journey.spec.ts`)

1. Create a project (TAM `10,000` organizations), the IDV (two new segments),
   and two competitors (SAM entered as `3k`). Both charts and the summary
   appear. Distances 0.650 and 0.804 match hand calculation.
2. Click RouteMate on the radial map → side panel → Edit → SAM 2000 → the bar,
   the map marker's label, the summary and the panel all update to 0.541.
3. Wait for "Saved", reload: the project, products and distances persist.
4. SAM `abc` → parse error, save blocked, text kept. SAM `50000` → "exceeds the
   project TAM (10,000 organizations)", saved as a draft. The banner says the
   analysis is not current and charts are badged "Not current". A custom split
   of 60/30 → "totals 90.00%". Both are then fixed: the other inputs are intact,
   errors clear, and distances update (Dispatchly 0.759).
5. Open the fictional example. All five labels are present, at least 10 px
   tall, and do not overlap at 1440 px and 390 px widths, with and without the
   segment overlay. A segment centre opens its allocation panel.
6. Exports. Landscape PNG is exactly 1920×1080 in both standard and clean
   variants. Landscape SVG has an XML prolog, a 1920×1080 viewBox, an embedded
   `<style>`, every product name and the segment-centre legend, and no
   scripts, images, `@import`, `url(` or external hrefs. The distance PNG is
   1920 wide and ≥1080 tall; the distance SVG has every name, all four exact
   values, and "Near IDV"/"Farther". The report HTML has a CSP, no `<script>`,
   two inline SVGs, every section and name, and the expected nearest-competitor
   sentence. JSON carries format, schema 1, model version, 5 products and a
   layout cache. The report also prints to an A4 PDF.
7. Import the exported JSON. A new "(imported)" project appears beside the
   original, with identical distances and table values and editable fields.
   A schema-99 file is rejected with "newer version" and storage is unchanged.
8. Keyboard: map markers have `tabindex=0`; Enter opens the panel with focus on
   its heading; Edit opens the form from the keyboard. Injection: the name
   `<img src=x onerror=…>`, a `<script>` description and a `javascript:`
   reference URL are shown as literal text with errors flagged. No `img[src=x]`
   or `javascript:` link exists in the DOM and `window.__xss` stays undefined.
   The report escapes `& " <` in descriptions. No page errors were raised.

## Visual inspection

Screenshots and exports were opened and reviewed:

- the desktop workspace, the product side panel, and the narrow (390 px)
  layout;
- the landscape PNG (standard and clean), the distance PNG, and the full HTML
  report as rendered in Chromium;
- a 30-product stress project: on-screen map, landscape PNG, distance PNG.

Fixes made during inspection:

- Ring labels now avoid product markers and stay inside the canvas, with a
  short `1.00` label on narrow screens.
- The products table is more compact.
- The legend panel no longer clips text.
- The clean export falls back to the wide keyed legend when any name cannot be
  shown directly (caught by a new unit test).
- The 1920×1080 distance chart is vertically centred with taller rows.
- The report uses a compact distance chart and scrollable tables.

## Claude Artifact build

After the artifact changes: typecheck passes, **82** unit tests pass (adds an
account-backend suite against a fake `db`, and the worker-fallback test), and
both Playwright journeys pass on the standalone build.

The artifact page was smoke-tested in Chromium inside a replica of the publish
skeleton:

- **Fake `window.claude` with `db`/`user`/`downloads`.** Opening the example
  and editing it through the chart stored the project and its snapshot under
  `data/users/<uid>/`. The PNG export (254 KB) and JSON export were handed to
  `downloads.save`.
- **No capabilities.** The page fell back to browser storage, and the Export
  menu explained that saving files is unavailable.
- Both runs: no console errors in light or dark, and no horizontal overflow
  at 390 px.

The live per-viewer store could not be read back from this session; it is
private to each viewer and empty until they use the page.

## Not verified / limitations

- Only Chromium was automated. Firefox and Safari are untested; the app uses
  standard IndexedDB, module Workers, `canvas.toBlob` and SVG-in-`<img>`.
- Windows and macOS were not run here. The npm scripts are cross-platform and
  contain no shell-specific syntax.
- Label collision uses estimated text widths. Exotic fonts or very long names
  are truncated with "…" on the map, while the keyed list keeps full names.
- A PNG export uses whatever system sans-serif font the browser has; exact
  glyphs vary by OS.
