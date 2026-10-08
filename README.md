# Market-Distance-Matrix

**Market Landscape** turns a small set of researched competitors into an
editable competitive landscape and a presentation-ready graphic. You enter one
TAM, your main product (the **IDV**), and each competitor's SAM and customer
segments. The app computes a **modelled market-distance matrix**, then shows:

- **Exact distance bars:** each competitor's modelled distance from the IDV on
  a fixed 0–1 scale.
- **A radial landscape:** the IDV at the centre, each competitor at its exact
  distance, with directions fitted to the competitor-to-competitor distances.
  The fit error is shown.
- **A written summary** with sources, methodology and an exact relationship
  table.

You can export a 1920×1080 PNG, SVGs, a printable HTML report, or a portable
JSON backup. Everything runs locally in the browser: no account, server, API
key or LLM.

The app lives in [`competitive-landscape/`](competitive-landscape/). It is also
published as a Claude Artifact: https://claude.ai/artifact/Ds6nJv5dvHdPe6iSPSP5zE
(private until shared from its Share menu).

## Quick start

Requires Node.js 20.19+ or 22.12+ (an LTS release is recommended). The commands
are the same on Windows, macOS and Linux.

```bash
cd competitive-landscape
npm install
npm run dev
```

Open http://127.0.0.1:5173 and choose **Open example** to load the fictional
"AI assistants" demo, or **Create project** to start your own.

| Command | What it does |
|---|---|
| `npm run dev` | Development server at http://127.0.0.1:5173 |
| `npm run typecheck` | Strict TypeScript check |
| `npm run test` | Vitest numerical, domain, persistence and scene tests |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build at http://127.0.0.1:4173 |
| `npm run e2e` | Playwright journey against the production build (needs Chromium: `npx playwright install chromium` on a fresh machine) |
| `npm run build:artifact` | Build the Claude Artifact version into `dist-artifact/` (`market-landscape.html` plus the layout worker, published side by side) |

## Using it

1. **Create a project.** Give it a name, a short market description, the TAM,
   one market-size unit (customers, organizations, or a custom count — never
   currency), and a reference year or date.
2. **Add your IDV**, then competitors. Each needs a name, a short description,
   a SAM (≤ TAM; `350000`, `350,000` and `350k` all work) and at least one
   customer-segment tag. The SAM is split equally across tags unless you open
   **Adjust segment split** and enter percentages that total 100%. SOM,
   comparable price (free / published / quote / unknown), evidence status and
   references are optional.
3. **Read the landscape.**
   - Click, tap, or Tab + Enter on any product in either chart or table to
     open its panel (inputs, sources, metrics), then **Edit**.
   - **Show segments** overlays modelled segment centres.
   - Select a cell in the distance matrix to compare a pair's model distance
     with the distance shown on the map.
4. **Export** from the workspace header:
   - Landscape PNG (1920×1080) or SVG
   - Distance chart PNG or SVG (with an optional clean presentation variant)
   - Report (HTML), which you can print to PDF
   - Project JSON

Incomplete competitors are kept as drafts and join the analysis once they have
a SAM and a segment. Invalid values never produce "current" results. Examples:
a SAM above the TAM, a split that doesn't total 100%, or footprints whose
modelled union exceeds the TAM. Your draft is still saved; the charts show the
last valid analysis, marked **Not current**, until you fix the problem.

## How the numbers work

Overlap is estimated from SAM and segment splits under a stated nested-coverage
assumption: within a shared segment, the smaller addressed population is
assumed to lie inside the larger one.

```
m_is = SAM_i × share_is          O_ij = Σ_s min(m_is, m_js)
G_ij = O_ij / √(SAM_i × SAM_j)   d_ij = √(1 − G_ij)
```

Distance 0 means an identical modelled footprint; 1 means no shared segments.
It is a modelled distance, not a percentage of customers or a market share.
Price, SOM and features never affect the geometry. Full details, including the
radial fit, grouping rules and diagnostics, are in
[`competitive-landscape/MODEL.md`](competitive-landscape/MODEL.md).

## Storage and backup

Projects are saved automatically (the header shows Saving / Saved / Save
failed) in the browser's **IndexedDB for this site only**. They are not visible
in another browser, profile, or address (e.g. `localhost` vs `127.0.0.1`), and
clearing site data deletes them. Nothing is sent to a server, and there is no
cloud save.

**Export → Project JSON** is your portable, user-controlled backup. Import it
from the Projects page; it always becomes a new project and never overwrites an
existing one. Imports are validated: unknown schema versions, malformed
numbers, broken references, script markup and non-http(s) links are rejected.

### In the Claude Artifact

The artifact runs the same code with three runtime capabilities. Signed-in
viewers' projects are saved in their own private area of the artifact's store
(`db` + `user`), visible only to them. Exports go through `downloads`, which
asks the viewer to confirm each file. Without those capabilities (signed out,
or a view that doesn't grant them) the page falls back to browser storage and
explains that file export is unavailable. It follows the viewer's light or
dark theme; exported images stay on white.

## Limitations

- An early-exploration tool for curated public information and explicit
  estimates. It does not research the web, fetch or verify source links,
  predict adoption, or measure market share or customer preference.
- Segment tags must be distinct slices; overlapping personas are not modelled.
- A flat map cannot preserve every pairwise distance. Use the relationship
  table for exact values; the map shows its own fit error.
- Up to 50 products (including the IDV) and 30 segments per project.
- Only Chromium was tested automatically. The UI is light-theme only.

## Documentation

- [`competitive-landscape/MODEL.md`](competitive-landscape/MODEL.md) — numerical model
- [`competitive-landscape/DECISIONS.md`](competitive-landscape/DECISIONS.md) — design and implementation decisions
- [`competitive-landscape/VALIDATION.md`](competitive-landscape/VALIDATION.md) — test and inspection record
- [`competitive-landscape/README.md`](competitive-landscape/README.md) — app commands and source layout

The bundled "AI assistants" example is fictional: its numbers are invented,
and product names imply no affiliation.
