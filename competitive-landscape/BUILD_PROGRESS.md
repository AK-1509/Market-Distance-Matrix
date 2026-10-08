# Build progress

Resume here after context compaction. Brief: the "Competitive Landscape MVP — autonomous build brief" supplied with the task.
App lives in `competitive-landscape/` (repo root README/.gitignore updated at the end).

## Phases
- [x] A — scaffold (Vite + React + TS, Dexie, Zod, Vitest, Playwright 1.56.1 pinned to preinstalled Chromium)
- [x] B — pure domain layer + numerical tests
- [x] C — persistence, forms, autosave, JSON import/export
- [x] D — charts, worker layout, interaction, demo fixture
- [x] E — narrative report, SVG/PNG/HTML exports
- [x] F — typecheck/test/build/e2e, docs (README, DECISIONS, MODEL, VALIDATION), commit + push

## Notes
- Versions pinned: vite 7.3.7, react 19.2.8, ts 5.9.3, vitest 4.1.11 (3.x had audit advisories), zod 4.1.13, dexie 4.2.1, @playwright/test 1.56.1.
- package.json `overrides.vite = $vite` works around an npm 10 arborist crash (edgesOut) from vitest's optional vite@8 peer chain.
- Domain in src/domain/*: model, geometry, grouping, analysis, layout (pure optimiser), diagnostics, narrative, methodology, schema (import), price, validation.
- Worker: src/worker/{coordinator,layout.worker,protocol}.ts. Storage: src/storage/{db,repository}.ts.
- Tests: tests/*.test.ts (68 passing at end of phase B; 76 at delivery).
- UI: src/app (hooks, routing, exports), src/charts (scenes + SceneSvg renderer), src/export (SVG/PNG/report), src/ui (components).
- E2E: e2e/journey.spec.ts (2 tests, all 8 critical-journey steps). Artifacts land in test-results/exports (gitignored).
- Docs: README (repo root + app), MODEL.md, DECISIONS.md, VALIDATION.md.

## Status
MVP complete: typecheck, 76 unit tests, build, 2 Playwright journeys pass. See VALIDATION.md for the record and remaining limitations.
