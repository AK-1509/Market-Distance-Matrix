# Market Landscape

Turn a small set of researched competitors into an editable competitive landscape and a presentation-ready graphic.

Market Landscape is a local-first web app for early market exploration. You define one project-wide TAM, name the **IDV** (the main product being evaluated), and enter each product's SAM, optional SOM, customer segments, and optional comparable price. The app computes modeled market overlap and shows:

- **Exact distance bars**: each competitor's modeled distance from the IDV on a fixed 0–1 scale.
- **Radial landscape**: the IDV at the center, each competitor at its exact distance, and angles fitted to approximate competitor-to-competitor distances. The map distance error is disclosed.
- **Written summary**: deterministic prose generated from the metrics, with citations back to your inputs and sources.
- **Exports**: PNG (1920×1080) and SVG of both charts, a self-contained printable HTML report, and a portable JSON backup.

No account, server, API key, or network access is needed after installation.

## Requirements

- Node.js **20.19+** or **22.12+** (an LTS release is recommended) and npm.
- A current Chromium-based browser, Firefox, or Safari.

## Install and run

macOS, Linux, and Windows (PowerShell or Command Prompt) use the same commands:

```sh
npm install
npm run dev
```

Then open <http://127.0.0.1:5173>. Stop the server with `Ctrl+C`.

To serve the optimized production build instead:

```sh
npm run build
npm run preview        # http://127.0.0.1:4173
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload (port 5173). |
| `npm run build` | Typecheck and produce the production bundle in `dist/`. |
| `npm run preview` | Serve `dist/` locally (port 4173). |
| `npm run typecheck` | TypeScript project check (`tsc -b`). |
| `npm run test` | Vitest unit tests: numerical model, layout, storage, import/export, exports. |
| `npm run test:e2e` | Playwright browser journey. Builds and serves the app automatically. |
| `npm run check` | Typecheck, then unit tests, then build. |

On a fresh machine, the end-to-end tests need Playwright's Chromium once: `npx playwright install chromium`. Playwright is pinned to 1.56.1.

## Using the app

1. **Create project.** Enter a name, a short market description, the TAM, a non-monetary unit (customers, organizations, or a custom unit), and a reference date.
2. **Add the IDV.** Give it a SAM and select or create customer segments. By default SAM is split equally across the selected segments; open **Adjust segment split** to enter custom percentages, which must total 100%.
3. **Add competitors** the same way. The charts fill in as soon as the IDV and one competitor are complete. Incomplete drafts (no SAM or no segments) are saved but left out of the analysis.
4. **Inspect.** Click, tap, or Tab+Enter any product on the map, the bars, or the table. The side panel shows its inputs, sources, and metrics, plus an **Edit** button. **Show segments** overlays modeled segment centers.
5. **Export** from the header.

Use **Open example** on the projects page for the fictional "AI assistants — fictional market footprints" demo. It opens as a new copy and never overwrites your projects. Its numbers are illustrative and do not describe real companies.

## Storage and backup

- Projects are stored in your browser's **IndexedDB** for this site (origin) only. A different browser, device, profile, or port, or clearing site data, will not have them. **Nothing is saved to the cloud.**
- Edits autosave after a short pause. The header shows *Saving…*, *Saved*, or *Save failed* based on the actual database write.
- The **last valid analysis** is stored separately from your draft. If an edit makes the project unanalyzable (for example, the modeled union exceeds TAM), the draft is kept as entered and the charts show the last valid analysis with an "out of date" banner. Charts and reports can't be exported until the issue is fixed.
- **Export → Project JSON** is the durable, user-controlled backup. **Import project** validates the file (structure, numbers, references, URLs, size, and schema version) and always adds it as a new project, so existing projects are never overwritten.

## The model (short version)

For each product, the SAM is split across segments: m_is = SAM_i × p_is. Overlap is O_ij = Σ_s min(m_is, m_js), which assumes the smaller population in a shared segment sits inside the larger one (maximum, nested overlap). That is an assumption, not an observation. Distance is d_ij = √(1 − O_ij / √(M_i M_j)). Price and SOM are context only and never affect the geometry. See [MODEL.md](./MODEL.md) for the full specification, and [DECISIONS.md](./DECISIONS.md) for implementation choices.

## Limitations

- Overlap is modeled from SAM and segment splits under a nested-coverage assumption. It does not measure actual shared customers, market share, preference, or demand.
- Segments are treated as disjoint slices; overlapping personas aren't modeled.
- The 2D map cannot preserve every competitor-to-competitor distance. The map distance error and the exact pairwise table show how much it distorts.
- Directional grouping thresholds (30°, 0.25) are transparent defaults, not statistically validated.
- Limits: 50 products including the IDV, 30 segments, and 5 MB import files.
- Prices are compared only when currency and billing basis match. There is no currency conversion.
- There is no automatic research, scraping, collaboration, accounts, or cloud sync. Source URLs are stored as links and are never fetched or verified.
- PNG export uses the browser's system sans-serif font, so the exact glyph metrics differ slightly between operating systems.

**Future work** (deliberately not in this MVP): feature weights, adoption or choice-share prediction, automated competitor detection, and longitudinal market-change inference.

## Project layout

```
src/domain/    pure analysis layer: model, allocations, geometry, grouping, radial optimizer, diagnostics, validation
src/report/    deterministic narrative and methodology text
src/charts/    renderer-independent chart scenes, label placement, SVG serializer, React renderer
src/app/       pipeline (analysis → layout → chart model → narrative), form logic, project mutations
src/storage/   Dexie database, repository, Zod import schema, JSON envelope
src/worker/    Web Worker running the radial layout, with stale-job rejection
src/export/    HTML report builder, PNG rasterization, download helpers
src/ui/        React components
src/fixtures/  fictional example (UI) and tiny synthetic fixture (tests only)
e2e/           Playwright journey
```

The domain layer has no UI or storage dependencies, so it could move to a server later without changes.
