# Model specification (`overlap-nested-1.0.0`)

This document is the contract implemented in `src/domain/`. The same formulas drive the charts, the summary, the tables, and every export.

## 1. Inputs

- Project TAM *T* (positive), one non-monetary unit for the whole project.
- Per product *i*: SAM *M_i* > 0, ≤ *T*; segment fractions *p_is* ≥ 0 with Σ_s p_is = 1 (within 1e-6). The default is an equal split across the selected segments.
- Segments are shared tags with stable IDs. Each tag is treated as a **distinct market slice**: the same customers should not appear in two tags.

SOM, price, evidence status, sources, and notes are context only. They never enter the geometry.

## 2. Modeled shared segment capacity

```
m_is   = M_i · p_is
O_ij   = Σ_s min(m_is, m_js)
G_ij   = O_ij / √(M_i · M_j)
d_ij   = √(max(0, 1 − clamp(G_ij, 0, 1)))
```

`O_ij` assumes the smaller addressed population within a shared segment lies inside the larger one. This is a maximum-overlap, nested-coverage **modeling assumption**, not an observation; real overlap may be lower. The UI's short wording is "Estimated overlap from SAM and segment splits."

Implementation notes:
- *M_i* is computed as Σ_s m_is. Fractions within the 1e-6 tolerance are normalized to sum exactly to 1 first. This is a floating-point clean-up only; larger deviations are rejected, never rescaled.
- *G* within 1e-12 of 1 is snapped to 1, so identical footprints give exactly 0.

Properties (tested): O is symmetric; 0 ≤ O_ij ≤ min(M_i, M_j); O_ii = M_i; d is symmetric, lies in [0, 1], and d_ii = 0. Identical footprints give 0 and disjoint segment sets give 1. Distinct products may share a modeled point.

### Exact Euclidean construction

For each segment, sort the unique positive *m_is* into thresholds t₁ < … < t_k (t₀ = 0). For each interval *l*, product *i* gets coordinate √(t_l − t_{l−1}) if m_is ≥ t_l, else 0. Concatenating across segments gives b_i with b_i·b_j = O_ij and ‖b_i‖² = M_i. With v_i = b_i/√M_i, ‖v_i − v_j‖/√2 = d_ij. So *d* is a true Euclidean metric in high dimensions. `src/domain/vectors.ts` implements this, and the tests check it agrees with the direct formula.

## 3. Market accounting

```
modeledUnion = Σ_s max_i m_is
```

The union must not exceed *T* (scale-aware tolerance *T*·1e-9). If it does, the draft is preserved and the analysis pauses with a reconciliation message. Nothing is rescaled. Summed SAMs may exceed *T*. *T* − union is "outside the modeled footprints", not proven unmet demand.

## 4. Metrics relative to the IDV (index 0)

```
sharedMarket        = O_0i
idvExposure         = O_0i / M_0
competitorExposure  = O_0i / M_i
distance            = d_0i
```

Distance, shared market, IDV exposure, and competitor exposure are ranked separately, with ties broken by stable ID.

## 5. Native angles (seen from the IDV)

```
cosθ_ij = (d_0i² + d_0j² − d_ij²) / (2 d_0i d_0j),   θ_ij = acos(clamp(cosθ, −1, 1))
```

The angle is null when either radius is ≤ 1e-9 (the footprint matches the IDV). Only rounding within 1e-6 is clamped; anything larger throws, because the geometry is Euclidean. Native angles are pairwise separations, not 0–360° bearings. Empty wedges are never treated as opportunities.

## 6. Directional groups

This is deterministic complete-link agglomeration over competitors whose direction is defined:
- Two groups may merge only if **every** cross pair has θ ≤ 30° **and** |d_0i − d_0j| ≤ 0.25.
- Among eligible merges, the smallest maximum cross angle wins, with ties broken by stable IDs.
- Footprints that match the IDV are listed separately.
- With fewer than 3 directional competitors, pairwise angles are reported instead of groups.

Groups are ranked by unique modeled overlap with the IDV, which counts each slice once:

```
groupShared = Σ_s min(m_0s, max_{i∈group} m_is)
```

Groups are described by their leading per-segment contributions. Thresholds live in `MODEL_SETTINGS` and are disclosed as transparent defaults, not validated statistics.

## 7. Segment coverage ("crowding")

For each segment, the app reports the number of analyzed competitors with a positive allocation and the IDV's allocation. With 3 or more competitors, a segment whose count is above the mean count across covered segments is labeled "More crowded"; below the mean, "Less covered in this comparison"; equal, "About average". With fewer than 3, only counts are given. The labels describe the entered footprints, not demand or profitability.

## 8. Radial layout

The IDV sits at the origin. Competitor *i* is placed at (d_0i cos φ_i, d_0i sin φ_i), so **radii equal the bar values exactly**. Only the angles are optimized:

```
loss = Σ_{1≤i<j≤n} (‖p_i − p_j‖ − d_ij)²
∂‖p_i − p_j‖/∂φ_i = (x_j y_i − x_i y_j) / ‖p_i − p_j‖
```

- **Optimizer:** monotone gradient descent with Armijo backtracking and an analytic gradient. It runs at most 2,000 iterations per start and stops after 25 consecutive steps with relative improvement < 1e-10.
- **Starts (12):** a warm start from the previous layout (when available), an ordering derived from classical MDS of the full native distance matrix (directions from the IDV's embedded point), an even angular ordering, then seeded random starts (mulberry32). The lowest-loss candidate is kept.
- **Rotation:** one nonzero-radius anchor competitor is fixed at angle 0. The anchor is the stored anchor while it still exists with a nonzero radius; otherwise it is the nearest nonzero-radius competitor (ties by ID). It is persisted in `layoutSettings.anchorProductId`.
- **Reflection and equal fits:** among equal fits (relative loss difference ≤ 1e-9), the candidate closest to the previous layout wins. The reflection is chosen to match the previous layout. Without a previous layout, the first free competitor in stable-ID order is placed above the anchor axis.
- Coordinates are never scaled. Zero-radius competitors sit at the origin. Coincident products are drawn as one selectable stack at their true position, never jittered. Label offsets and leader lines move freely; data points do not.
- The layout runs in a Web Worker. A new request terminates any in-flight job, and responses are accepted only for the latest job ID with a matching input hash.

### Map distance error

```
residual_ij        = displayed_ij − native_ij
relativeRMSError   = √(Σ_all pairs residual² / Σ_all pairs native²)   (0 when both sums are 0)
```

"All pairs" means every pair of plotted products, including IDV pairs, whose residual is 0 by construction. The app also shows the maximum absolute error and the worst-distorted pair. This measures projection distortion only, not data confidence. Reports and tables always use native values.

## 9. Modeled segment centers

```
z_s = Σ_i m_is · p_i / Σ_i m_is
```

The sum runs over plotted products, including the IDV at the origin. Segments with zero weight get no marker. A center is a convex combination, so it lies inside the convex hull of its contributors. It summarizes the inputs, not measured preference. Different allocations can produce the same point; selecting a center lists its contributions.

## 10. Comparable price

Prices are compared only within groups that share currency, basis, and cadence; month and year are both "recurring". A yearly price gets a monthly equivalent (÷ 12) only inside such a group, and the original price and annual billing are kept. Free, Published, Contact for quote, and Unknown are distinct states. Quotes and unknowns are never ranked as free. There is no currency conversion and no invented seat count.

## 11. Worked example (fictional fixture)

TAM 1,000,000 potential customers. Amounts by segment: Programmers / Designers / Casual / Image.

| Product | SAM | Amounts | Overlap with IDV | d_0i | IDV exp. | Comp. exp. |
|---|---:|---|---:|---:|---:|---:|
| ChatGPT (IDV) | 500,000 | 150k / 0 / 200k / 150k | — | 0 | — | — |
| Gemini | 350,000 | 100k / 0 / 250k / 0 | 300,000 | 0.5318 | 60% | 86% |
| DeepSeek | 150,000 | 150k / 0 / 0 / 0 | 150,000 | 0.6725 | 30% | 100% |
| Claude | 350,000 | 200k / 150k / 0 / 0 | 150,000 | 0.8009 | 30% | 43% |
| Grok | 250,000 | 0 / 150k / 0 / 100k | 100,000 | 0.8469 | 20% | 40% |

The modeled union is 750,000 (200k + 150k + 250k + 150k). Summed SAMs are 1,600,000, which is allowed because the footprints overlap. 250,000 are outside the modeled footprints, which is not proven opportunity. No competitor pair is within 30° of another, so each occupies a distinct direction. The map distance error is about 15%; the largest gap is Gemini ↔ Grok, which are disjoint (modeled 1.000) but shown about 1.26 apart.
