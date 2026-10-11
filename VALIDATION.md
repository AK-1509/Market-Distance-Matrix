# Validation record

Environment: Linux container, Node 22.22.0, npm 10.9.4, Chromium 141 (Playwright 1.56.1, headless). Date: 2026-10-08.

## Gates (all run and passing)

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (`tsc -b`, app + node/e2e projects, strict) |
| `npm run test` | **69 passed** in 5 files |
| `npm run build` | Pass; no bundle-size warnings; layout worker emitted as its own chunk |
| `npm run test:e2e` | **3 passed** (production build served by `vite preview`) |

## Numerical and domain tests (`src/**/*.test.ts`)

- Identical footprints → distance 0; disjoint → 1.
- Tiny fixture: overlap 30, IDV exposure 30%, competitor exposure 100%, distance 0.6725157563.
- Fictional fixture: overlaps, distances, and exposures match values computed independently (by hand and in Python). Modeled union 750,000; summed SAMs 1,600,000; 250,000 outside.
- Symmetry, bounds, finiteness, and diagonals on four seeded random projects. Direct distances agree with the explicit threshold-vector construction.
- Group overlap and union don't double-count. Summed SAMs > TAM is allowed; union > TAM is flagged with the project unchanged.
- Equal splits sum to 1 for 1–30 segments; custom percentages convert exactly; formatting doesn't alter fractions; custom splits are preserved when segments change.
- Native angles: null at zero radius; known values; invalid geometry throws; IDV twins have an undefined direction.
- Input order (products and segments reversed) doesn't change metrics, rankings, or groups.
- Radial layout: radii equal native distances to 1e-12; exact 2D configurations are recovered (loss < 1e-10); deterministic; the best candidate is retained; the reported loss matches a recomputation; reflection aligns to the previous layout; anchor rules hold; IDV-only, single competitor, all-zero, equal radii, disjoint, and coincident cases produce finite results with no jitter.
- Diagnostics: the hand-computed relative RMS, max error, worst pair, and native vs displayed angles match; zero/zero gives an error of 0.
- Centroids: two equal weights give the midpoint; 50 random triangles stay inside the hull; zero-weight segments get no marker.
- Blank SOM and price stay unknown (not zero or free); zero SOM is valid; prices are compared only when currency and basis match; yearly → monthly equivalent with the original kept.
- Stale layout responses are rejected after a later request or a clear.
- Storage (fake-indexeddb): the JSON round trip preserves every input, ID, setting, and model version; imports under a new ID; never overwrites (even with the same ID in the file); the layout cache restores as a snapshot. Rejected: bad JSON, foreign files, newer schema versions, 1e999, dangling IDV/segment/anchor, fractions > 1, duplicate allocations, `<script>`, `onerror=`, `javascript:` and `file:` URLs, oversized files, 51 products. Drafts are accepted. A failed import leaves storage empty.
- Exports: the radial SVG is 1920×1080 with an opaque background, embedded style, no external refs, and every product name. The distance SVG has every name, distance, and the fixed axis. User text is escaped in SVG and HTML; the report has a CSP, no scripts, both charts, the required sections, and no preference or market-share claims. Counts replace crowding labels with fewer than 3 competitors. IDV twins and coincident products render without NaN. 50 products × 30 segments export every name with a keyed segment list.
- Product form: an untouched save preserves every stored value exactly; invalid input is kept and explained; drafts without SAM or segments are allowed.

## Browser journey (`e2e/journey.spec.ts`)

1. Create a project and IDV, add two competitors → both charts and the summary appear with the expected distances (0.541, 0.753).
2. Select Comet's map marker → side panel → **Edit Comet** → SAM 100,000 → bars, map aria-label, and summary all update to 0.707.
3. Reload → the project persists with the same values; the header reads "Saved".
4. SAM "3OO,000" and a 120% split show specific errors; Save is refused with the inputs kept; fixing them saves (0.650). A TAM of 450,000 (below the 500,000 modeled union) pauses the analysis with a reconciliation message and a stale banner; restoring the TAM clears both.
5. The fictional demo at 1440 px and 390 px: all product labels present, ≥ 11 px, non-overlapping; no horizontal page scroll at 390 px.
6. Exports through the real buttons: landscape PNG 1920×1080 (nonempty), landscape SVG with all names, legend, and the "Fictional example" marker, no images, scripts, or links; distance PNG 1920×1080; distance SVG; HTML report (2 SVGs, no scripts, required sections); JSON with 5 products and a layout cache. The report was opened in a page and screenshotted.
7. JSON import → a new "(imported)" project with identical distances; fields are editable (SAM "250,000", split "60"). A tampered file with `<script>` is rejected and no project is added.
8. Keyboard: Tab reaches a map marker, Enter opens details, Enter on Edit opens the form, Escape closes it. Event-handler markup is refused by the form. `<b>Pro</b> & Co` renders as literal text (no `<b>` element is created). A `javascript:` URL is refused; an HTTPS source renders as a link with `rel="noopener …"`. `window.__pwned` is never set.

## Visual inspection (screenshots reviewed)

- Workspace (desktop), selection state, segment overlay, dark mode, and narrow 390 px layout.
- Exported landscape PNG (detailed and clean), distance PNG, the HTML report (screen render and an 8-page print-to-PDF), and a dense 24-product synthetic landscape.
- Fixed during review: ring labels colliding with markers (now placed in the clearest direction), truncated bar sublines, page-level horizontal scroll at 390 px (caused by an absolutely positioned screen-reader-only header), empty space in short distance exports (now vertically centered), and a missing "Fictional example" marker on chart exports. Also, product labels now have full-box hit areas.
- In the production build the layout runs in a real Web Worker (`layout.worker-*.js` observed).

## Not verified

- Firefox and Safari were not run (Chromium only). Windows and macOS were not run; scripts avoid shell-specific syntax.
- Screen-reader output was not tested with an actual assistive technology; semantics (roles, labels, live regions) were reviewed in code.
- PNG text rendering depends on the system sans-serif font available to each browser.
