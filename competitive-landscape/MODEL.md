# Market Landscape — numerical model

Model version: `nested-overlap-1.0` (`src/domain/constants.ts`). Every number in
the app, the exports and the report comes from the formulas below. Nothing uses
text embeddings, features, prices, popularity or chart coordinates as a
substitute.

## 1. Inputs

- One project-wide **TAM** in a single non-monetary unit (customers,
  organizations, or a custom unit).
- For each product *i*: **SAM** `M_i > 0`, and a split of that SAM across shared
  customer-segment tags, `p_is ≥ 0`, `Σ_s p_is = 1`. The default split is equal
  across the selected tags (stored as exact `1/k`); a custom split must total
  100% (tolerance `1e-6`).
- Each tag is treated as a distinct market slice. The same customers should not
  be listed under two tags.

Addressed amount per segment: `m_is = M_i × p_is`.

## 2. Overlap and distance

Real customer overlap cannot be recovered from SAM totals and tag names, so the
model uses **modelled shared segment capacity** under a nested (maximum-overlap)
assumption: within a shared segment, the smaller addressed population is assumed
to lie inside the larger one. This is a modelling choice, not an observation.

```
O_ij = Σ_s min(m_is, m_js)
G_ij = O_ij / √(M_i × M_j)
d_ij = √(max(0, 1 − clamp(G_ij, 0, 1)))
```

Properties (all unit-tested): `O_ii = M_i`, `d_ii = 0`; `O` and `d` are
symmetric; `0 ≤ O_ij ≤ min(M_i, M_j)`; `d ∈ [0, 1]`; identical footprints give
`0`; disjoint segment sets give `1`. When `1 − G` is below `1e-12` (floating-point
noise for identical footprints) the distance is reported as exactly 0.

**Exact geometry.** For each segment, sort the unique positive `m_is` into
thresholds `t_1 < … < t_k` (`t_0 = 0`); product *i* gets coordinate
`√(t_l − t_{l−1})` on interval *l* when `m_is ≥ t_l`. Concatenating segments
gives `b_i` with `b_i · b_j = O_ij` and `‖b_i‖² = M_i`, so with `v_i = b_i / √M_i`,
`‖v_i − v_j‖ / √2 = d_ij`. The tests check the direct formula against this
construction (`src/domain/geometry.ts`).

## 3. Market accounting

```
modelled union = Σ_s max_i m_is   (must be ≤ TAM, relative tolerance 1e-9)
```

The sum of SAMs may exceed TAM because footprints overlap. If the union exceeds
TAM the draft is kept, analysis is blocked, and the user is asked to reconcile
TAM, SAMs or splits — nothing is rescaled. `TAM − union` is described as
"outside the modelled footprints", never as proven unmet demand. TAM is never
used as a chart scale.

## 4. Metrics relative to the IDV (index 0)

| Metric | Formula |
|---|---|
| shared market | `O_0i` |
| IDV exposure | `O_0i / M_0` |
| competitor exposure | `O_0i / M_i` |
| distance | `d_0i` |

Distance, absolute shared market and the two exposures are ranked separately
(ties by stable ID).

**Native angle** between competitors *i* and *j* as seen from the IDV:

```
cos θ_ij = (d_0i² + d_0j² − d_ij²) / (2 d_0i d_0j),   θ_ij = acos(clamp(cos, −1, 1))
```

It is `null` (direction undefined) when either radius is below `1e-9`, i.e. the
footprint matches the IDV. Clamping only absorbs rounding; `|cos| > 1 + 1e-6`
throws. These are pairwise separations in high-dimensional space, not compass
bearings, and empty map directions are never treated as opportunity.

## 5. Directional groups

Deterministic complete-link agglomeration over competitors with a defined
direction: repeatedly merge the eligible pair of groups with the smallest
largest cross-pair angle. A merge is eligible only if **every** cross pair has
`θ ≤ 30°` and `|d_0i − d_0j| ≤ 0.25`. Ties break by stable ID. With fewer than 3
directional competitors, pair relationships are reported instead. Groups are
ranked by unique overlap with the IDV, counting each slice once:

```
groupShared = Σ_s min(m_0s, max_{i ∈ group} m_is)
```

Groups are described by their leading segment contributions. The thresholds are
transparent defaults in `MODEL_SETTINGS`, not statistically validated values.

## 6. Segment coverage

Per segment: the number of competitors with a positive allocation, plus the
IDV's allocation. With at least 3 competitors, "More crowded" means at least 50%
of competitors are present, and "Less covered in this comparison" means at most
25%. Below 3 competitors only counts are given. These labels describe the
compared set, not demand or profitability.

## 7. Radial map (constrained fit)

IDV at `(0, 0)`. Competitor *i* is plotted at radius `r_i = d_0i` (exact, equal
to its bar) and angle `φ_i`:

```
x_i = d_0i cos φ_i,   y_i = d_0i sin φ_i
loss = Σ_{i<j} (‖p_i − p_j‖ − d_ij)²     (competitor pairs only)
```

Only the angles are optimised (`src/domain/layout.ts`, run in a Web Worker):

- **Rotation:** a non-zero-radius anchor is fixed at angle 0. By default this is
  the earliest-created competitor (IDs are time-ordered). It is persisted in
  `layoutSettings.anchorProductId` and kept until it is removed or comes to match
  the IDV. The user can choose it via "Use as map reference direction".
- **Starts:** a warm start from the previous layout (when available), a
  deterministic law-of-cosines placement, then seeded random starts (mulberry32)
  — 12 in total.
- **Optimiser:** Adam on the analytic gradient
  `∂e_ij/∂φ_i = (x_j y_i − x_i y_j) / e_ij`, at most 2,000 iterations with an
  exponentially decaying step, stopping early when a 50-iteration window
  improves the loss by less than `1e-12 + 1e-9·loss`. A monotone
  backtracking gradient-descent polish follows. The lowest-loss start wins;
  earlier starts win exact ties.
- **Reflection:** this leaves the loss unchanged, so it is aligned to the
  previous layout. Otherwise the first non-collinear free product is placed
  above the axis. Coordinates are never scaled.
- **Coincident products:** competitors with identical footprints share one
  angle variable, so they sit at exactly the same point and are drawn as one
  selectable stack. Nothing is jittered.
- Zoom and pan are viewing transforms only.

**Fit diagnostics** over **all** pairs, IDV pairs included (their residuals are
0 by construction):

```
residual_ij = displayed_ij − native_ij
map distance error = √(Σ residual² / Σ native²)   (0 when both sums are 0)
```

The maximum absolute error, the worst pair, and the native vs displayed angle
for any selected pair are also shown. This measures how well a flat map
reproduces the model; it is not data confidence.

## 8. Modelled segment centres

```
z_s = Σ_i m_is p_i / Σ_i m_is        (over all plotted products, IDV included)
```

Zero-weight segments get no marker. A centre summarises the entered footprints,
not measured preferences or market share. Different distributions can produce
the same point, so selecting a centre shows its allocations.

## 9. Price and SOM (context only)

Prices never enter the geometry. A recurring published price is compared only
when currency and billing basis match the IDV's. An annual price shows a monthly
equivalent (`÷12`) next to the original. Free is a real price of 0. Quotes and
unknown prices are listed separately and never ranked as free. Currencies are
never converted. SOM is an optional scenario estimate: blank means unknown (not
zero), and it is never described as current users or market share.

## 10. Out of scope (future work)

Feature weights, choice-share or adoption models, preference centroids,
automated competitor detection, overlapping personas, and longitudinal
market-change inference.
