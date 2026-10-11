# Decisions

Significant implementation choices made while executing the build brief. Routine choices are not listed.

## Setup

1. **New app in `competitive-landscape/`.** The repository was empty, so there was no compatible app to reuse.
2. **Stable, well-known majors rather than the newest.** The stack is React 19.2, Vite 7.3, TypeScript 5.9, Vitest 3.2, Dexie 4, and Zod 4. Vite 8, TypeScript 7 (the native port), and Vitest 5 were available but newer. Node 22.22 satisfies Vite 7's `^20.19 || >=22.12`. `package-lock.json` is committed.
3. **Playwright pinned to 1.56.1** to match the preinstalled Chromium build (`chromium-1194`), so no browser download was needed. Fresh machines run `npx playwright install chromium`.
4. **No router or state library.** Routing is hash-based (`#/project/<id>`) so a refresh reopens the same project. Citation jumps use buttons with `scrollIntoView`, not `#anchors`, so they don't collide with the router.
5. **Vendor chunks split** (`react`, `storage` = Dexie + Zod) to keep each bundle under 500 kB.

## Model and analysis

6. **M_i = Σ_s m_is.** Fractions within the 1e-6 tolerance are renormalized to sum exactly to 1 (floating-point clean-up only), so O_ii = M_i and identical footprints give exactly 0. Larger deviations are rejected, never rescaled.
7. **Similarity snapped to 1 within 1e-12.** This prevents tiny nonzero distances for identical footprints. Only float noise is affected.
8. **Grossly invalid native angles throw** instead of being clamped (|cos| > 1 + 1e-6). Because *d* is Euclidean this can only signal a bug.
9. **Readiness model.** Incomplete competitors (no SAM or no segments) are saved but excluded, with a warning, so the landscape grows progressively. Invalid values (SAM ≤ 0, SAM > TAM, custom split ≠ 100%, SOM > SAM, union > TAM, missing or incomplete IDV, limits exceeded) pause the analysis. The last valid snapshot is then shown dimmed under an "out of date" banner, and chart and report exports are disabled until the issue is fixed. JSON export is always available.
10. **Crowding labels** compare each covered segment's competitor count with the mean count across covered segments (above → "More crowded", below → "Less covered in this comparison", equal → "About average"). Labels appear only with 3 or more competitors.
11. **Price comparability** requires amount, currency, period, and basis. Month and year share a "recurring" group with a monthly equivalent; one-time and usage are separate groups. Basis is matched case- and whitespace-insensitively.

## Radial layout

12. **Optimizer: gradient descent with Armijo backtracking** rather than Adam. It is monotone, so "retain the best" and convergence detection are simple and reliable. It recovers exactly embeddable 2D configurations to loss < 1e-10 in tests. Fifty products take about 0.5 s in a worker.
13. **Start set:** previous layout (warm start), a classical-MDS ordering (power iteration on the double-centered matrix including the IDV), an even ordering, and seeded random starts up to 12 in total.
14. **Anchor:** the stored anchor if it still exists with a nonzero radius, otherwise the nearest nonzero-radius competitor (ties by ID). It is resolved on the main thread, persisted to `layoutSettings.anchorProductId`, and included in the input hash. The warm-start angles are not part of the hash.
15. **Reflection without a previous layout:** the first free competitor in stable-ID order goes above the anchor axis.
16. **Map distance error over all plotted pairs, including IDV pairs**, exactly as the brief's formula states. The maximum absolute error and the worst pair are also shown, so distortion can't hide behind the exact IDV pairs.
17. **Cancellation:** a new layout request terminates the busy worker. A `LatestJobTracker` accepts only the latest job ID whose hash still matches. If module workers are unavailable, the layout runs asynchronously on the main thread.
18. **Snapshot reuse:** if the stored snapshot's hash matches the current inputs, its layout is reused without refitting. This covers reopening, import with a layout cache, and recovering from an invalid edit.

## Charts and exports

19. **One renderer-independent scene.** `src/charts/*Scene.ts` produce primitives (circles, paths, text, groups with targets). React renders them interactively using CSS variables, which enables dark mode; `sceneToSvg` serializes them with the fixed light palette for exports. Both read the same chart model and data coordinates; exports fit labels separately.
20. **Colors:** the validated 8-slot categorical palette is assigned in project order (the IDV always uses the ink marker). Competitors beyond 8 get a neutral gray and are identified by direct labels and the keyed list rather than generated hues. Text never uses series colors.
21. **Uniform marker areas.** The IDV is distinguished by an ink fill plus an outer ring, not by size. A coincident group is drawn as one ink-gray marker with a count, and selecting it lists its products.
22. **Viewing transform only:** "Full scale" (0–1) or "Fit to products" (nearest 0.05, 0.1, or 0.25 ring step). No free zoom or pan. Ring labels are placed in the direction with the most angular clearance from markers.
23. **Segment-center labels:** all are shown on screen when there are 6 or fewer segments (8 or fewer in exports). Otherwise they appear only on selection on screen, and as keyed `S1…Sn` with a legend list in exports.
24. **Exports:** the 1920×1080 landscape includes a title, a "Fictional example" marker when relevant, a legend, a keyed competitor list (all names guaranteed), map error (detailed variant), and a footnote. The clean variant drops distance values and the error paragraph. The distance chart grows taller than 1080 only beyond about 30 rows. PNGs are rasterized from the same SVG via canvas with an opaque white background.
25. **HTML report:** a restrictive CSP meta (`default-src 'none'`), no scripts or remote assets, all user text escaped, only HTTP(S) links, and print CSS that appends link targets.

## Input, import, safety

26. **Form validation.** Name and description are required to save (the brief says both are required). SAM and segments may be blank, which makes a draft. Unparseable numbers, negative values, SOM > SAM, a custom split ≠ 100%, an incomplete published price, and invalid source URLs block saving with inline errors. The raw input is kept in the form. SAM > TAM is allowed with a warning, because the TAM may be what needs fixing.
27. **Exact round trip.** Editing a product without touching its split keeps the stored fractions bit-for-bit (`0.3 × 100` would otherwise become `30.000000000000004`). Amounts are shown for editing without rounding.
28. **"Executable markup" definition,** shared by forms and import: script-capable tags (`script`, `iframe`, `object`, `embed`, `svg`, `math`, `style`, `link`, `meta`, `base`, `form`, `template`, frames), inline event-handler attributes inside tags, `javascript:`/`vbscript:` schemes, and `data:` HTML, SVG, or JS. Harmless text like `<b>` is allowed and shown literally, since all rendering escapes text.
29. **Import** always creates a new project ID and appends " (imported)" to a duplicate name. It uses `add`, never `put`. Product and segment IDs are preserved, so metrics and the layout cache stay valid. The import accepts every state the app can save, including drafts and SAM > TAM, but rejects nonfinite numbers, dangling IDs (IDV, allocations, anchor), malformed or duplicate allocations, non-HTTP(S) URLs, executable markup, more than 50 products or 30 segments, files over 5 MB, and newer schema versions (with a clear message).
30. **Segment deletion** (in project settings) recomputes equal splits. It keeps the remaining shares of custom splits, so the user must fix their total; this is never renormalized silently. Deleting the anchor or IDV product clears that reference.
31. **Destructive actions** use a two-step "click again" button instead of `window.confirm`.
32. **Fictional fixture:** the reference date is "2026 (illustrative)". `isExample` drives a "Fictional example" badge in the UI, the report, and both chart exports. Product descriptions are neutral and make no live claims.
