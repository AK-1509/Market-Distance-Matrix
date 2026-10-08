# Build progress

Resume here after context compaction. Brief: `/root/.claude/uploads/.../CLAUDE_BUILD_PLAN.md` (Market Landscape MVP).
App lives in `competitive-landscape/` (repo root README/.gitignore updated at the end).

## Phases
- [x] A — scaffold (Vite + React + TS, Dexie, Zod, Vitest, Playwright 1.56.1 pinned to preinstalled Chromium)
- [x] B — pure domain layer + numerical tests
- [ ] C — persistence, forms, autosave, JSON import/export
- [ ] D — charts, worker layout, interaction, demo fixture
- [ ] E — narrative report, SVG/PNG/HTML exports
- [ ] F — typecheck/test/build/e2e, docs (README, DECISIONS, MODEL, VALIDATION), commit + push

## Notes
- Versions pinned: vite 7.3.7, react 19.2.8, ts 5.9.3, vitest 4.1.11 (3.x had audit advisories), zod 4.1.13, dexie 4.2.1, @playwright/test 1.56.1.
- package.json `overrides.vite = $vite` works around an npm 10 arborist crash (edgesOut) from vitest's optional vite@8 peer chain.
- Domain in src/domain/*: model, geometry, grouping, analysis, layout (pure optimiser), diagnostics, narrative, methodology, schema (import), price, validation.
- Worker: src/worker/{coordinator,layout.worker,protocol}.ts. Storage: src/storage/{db,repository}.ts.
- Tests: tests/*.test.ts (68 passing at end of phase B).
