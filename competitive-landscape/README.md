# Market Landscape (app)

The local-first web app that generates the market-distance matrix, distance
bars, radial landscape and report. See the [repository README](../README.md) for
an overview, usage and limitations.

```bash
npm install        # Node 20.19+ or 22.12+
npm run dev        # http://127.0.0.1:5173
npm run typecheck
npm run test       # Vitest: numerical, domain, persistence and scene tests
npm run build      # production build in dist/
npm run preview    # serve dist/ at http://127.0.0.1:4173
npm run e2e        # Playwright journey (builds, then runs against preview)
```

Reference docs in this folder:

- [MODEL.md](MODEL.md) — the numerical model and the radial fit
- [DECISIONS.md](DECISIONS.md) — significant implementation choices
- [VALIDATION.md](VALIDATION.md) — what was tested and what remains unverified
- [BUILD_PROGRESS.md](BUILD_PROGRESS.md) — build log

## Layout

```
src/domain/    pure TypeScript model: allocation, overlap/distance matrices,
               geometry, grouping, layout optimiser, diagnostics, narrative,
               methodology, validation, import schema (Zod), fixtures
src/worker/    layout Web Worker and the stale-safe coordinator
src/storage/   Dexie (IndexedDB): drafts and last-valid snapshots
src/charts/    scene builders (radial, distance) + one SVG renderer
src/export/    SVG/PNG serialisation and the HTML report
src/app/       state hooks (debounced save, analysis), routing, export actions
src/ui/        React components
tests/         Vitest suites      e2e/   Playwright journey
```

The domain layer has no UI or storage dependencies. It can move to a server
unchanged.
