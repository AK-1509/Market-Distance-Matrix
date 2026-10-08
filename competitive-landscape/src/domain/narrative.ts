// Deterministic written summary generated from structured metrics. No LLM.
// Output is structured (text runs + citations) so the app renders it with
// React and the HTML report escapes it; neither path ever injects markup.

import type { Analysis } from './analysis';
import { MODEL_SETTINGS, MODEL_VERSION } from './constants';
import type { LayoutDiagnostics } from './diagnostics';
import { formatDate, formatDegrees, formatDistance, formatPercent, formatQuantity, formatSplitPercent } from './format';
import { pairDistance, pairNativeAngle } from './analysis';
import { describePrice, formatMoney } from './price';
import type { Product, Project, Source } from './types';

export interface Citation {
  label: string;
  href: string;
  title?: string;
}

export type Inline = string | { strong: string } | { cite: Citation[] };

export interface NarrativeSection {
  id: string;
  title: string;
  paragraphs: Inline[][];
  list?: Inline[][];
  note?: Inline[];
}

export interface ReferenceEntry {
  number: number;
  anchor: string;
  scope: string;
  productId: string | null;
  source: Source;
}

export interface Narrative {
  sections: NarrativeSection[];
  references: ReferenceEntry[];
  /** Products whose inputs have no reference attached. */
  unsourced: string[];
}

const METHOD: Citation = { label: 'method', href: '#methodology', title: 'How this was calculated' };

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function buildReferences(project: Project): ReferenceEntry[] {
  const refs: ReferenceEntry[] = [];
  let n = 0;
  for (const s of project.sources) {
    n += 1;
    refs.push({ number: n, anchor: `ref-${n}`, scope: 'Project', productId: null, source: s });
  }
  const ordered = [...project.products].sort((a, b) =>
    a.id === project.idvProductId ? -1 : b.id === project.idvProductId ? 1 : a.id < b.id ? -1 : 1,
  );
  for (const p of ordered) {
    for (const s of p.sources) {
      n += 1;
      refs.push({ number: n, anchor: `ref-${n}`, scope: p.name || 'Untitled product', productId: p.id, source: s });
    }
  }
  return refs;
}

export function buildNarrative(project: Project, analysis: Analysis, diagnostics: LayoutDiagnostics | null): Narrative {
  const references = buildReferences(project);
  const productById = new Map(project.products.map((p) => [p.id, p]));
  const unit = analysis.unit || 'units';
  const q = (v: number) => `${formatQuantity(v)} ${unit}`;
  const name = (id: string) => analysis.names[id] || 'Untitled product';
  const idvName = name(analysis.idvId);
  const segName = (id: string) => project.segments.find((s) => s.id === id)?.name ?? 'Unknown segment';

  const cite = (productIds: readonly string[], field?: string): Inline => {
    const out: Citation[] = [];
    for (const id of productIds) {
      const refs = references.filter(
        (r) => r.productId === id && (!field || !r.source.appliesTo?.length || r.source.appliesTo.includes(field)),
      );
      if (refs.length === 0) {
        out.push({ label: `${name(id)}: unsourced estimate`, href: '#references', title: 'No reference entered for this input' });
      } else {
        for (const r of refs) out.push({ label: String(r.number), href: `#${r.anchor}`, title: r.source.title || r.source.url });
      }
    }
    return { cite: out };
  };
  const projectCite = (): Inline => {
    const refs = references.filter((r) => r.productId === null);
    return {
      cite: refs.length
        ? refs.map((r) => ({ label: String(r.number), href: `#${r.anchor}`, title: r.source.title || r.source.url }))
        : [{ label: 'TAM: unsourced estimate', href: '#references', title: 'No project-level reference entered' }],
    };
  };

  const sections: NarrativeSection[] = [];
  const comps = analysis.competitors;
  const metric = (id: string) => comps.find((c) => c.id === id)!;

  // 1. Scope
  {
    const paragraphs: Inline[][] = [];
    const market = project.marketDescription.trim();
    paragraphs.push([
      `This landscape compares ${analysis.productIds.length} product${analysis.productIds.length === 1 ? '' : 's'} — the IDV `,
      { strong: idvName },
      ` and ${comps.length} competitor${comps.length === 1 ? '' : 's'}${market ? ` — in “${market}”` : ''}, as of ${project.referenceDate || 'an unspecified date'}. `,
      `The total addressable market (TAM) is ${q(analysis.tam)}.`,
      projectCite(),
    ]);
    paragraphs.push([
      `The SAMs sum to ${q(analysis.sumOfSams)}, but footprints overlap: the modelled union of all footprints is ${q(analysis.union)}, `,
      `leaving ${q(analysis.outsideModeled)} outside the modelled footprints. That remainder is simply not covered by this set of products; it is not evidence of unmet demand.`,
      { cite: [METHOD] },
    ]);
    paragraphs.push([
      'Overlap is estimated from each product’s SAM and segment split, assuming that within a shared segment the smaller addressed population lies inside the larger one. ',
      'This nested-coverage assumption is a modelling choice, not an observation. Distances run from 0 (identical modelled footprint) to 1 (no shared segments) and are not percentages of customers.',
      { cite: [METHOD] },
    ]);
    if (analysis.excluded.length > 0) {
      paragraphs.push([
        `Not yet analysed: ${analysis.excluded.map((e) => `${e.name} (needs ${e.missing.join(', ')})`).join('; ')}.`,
      ]);
    }
    sections.push({ id: 'scope', title: 'Scope', paragraphs });
  }

  // 2. Nearest competitors by native distance
  {
    const paragraphs: Inline[][] = [];
    const list: Inline[][] = [];
    if (comps.length === 0) {
      paragraphs.push(['Add a competitor to see modelled distances from the IDV.']);
    } else {
      const order = analysis.rankings.byDistance;
      const first = metric(order[0]);
      paragraphs.push([
        { strong: first.name },
        ` is closest to ${idvName}, at a modelled distance of ${formatDistance(first.distance)}. `,
        `It shares an estimated ${q(first.sharedMarket)} with ${idvName} — ${formatPercent(first.idvExposure)} of ${idvName}’s SAM and ${formatPercent(first.competitorExposure)} of ${first.name}’s.`,
        cite([analysis.idvId, first.id], 'sam'),
      ]);
      for (const id of order.slice(1, 5)) {
        const c = metric(id);
        list.push([
          { strong: c.name },
          `: distance ${formatDistance(c.distance)}; ${q(c.sharedMarket)} shared — ${formatPercent(c.idvExposure)} of ${idvName}’s SAM, ${formatPercent(c.competitorExposure)} of ${c.name}’s.`,
          cite([c.id], 'sam'),
        ]);
      }
      if (order.length > 5) list.push([`${order.length - 5} more in the relationship table.`]);
      if (analysis.matchesIdvIds.length > 0) {
        paragraphs.push([
          `${joinNames(analysis.matchesIdvIds.map(name))} ${analysis.matchesIdvIds.length === 1 ? 'has' : 'have'} a modelled footprint identical to ${idvName}’s (distance 0), so ${analysis.matchesIdvIds.length === 1 ? 'its' : 'their'} direction on the map is undefined and ${analysis.matchesIdvIds.length === 1 ? 'it is' : 'they are'} drawn at the IDV’s position.`,
        ]);
      }
    }
    sections.push({ id: 'nearest', title: 'Nearest competitors', paragraphs, list: list.length ? list : undefined });
  }

  // 3. Largest absolute modelled overlap (kept distinct from closeness)
  if (comps.length > 0) {
    const paragraphs: Inline[][] = [];
    const bySize = analysis.rankings.bySharedMarket;
    const top = bySize.slice(0, 4).map((id) => `${name(id)} (${formatQuantity(metric(id).sharedMarket)})`);
    paragraphs.push([
      `Ranked by absolute modelled shared market with ${idvName}: ${joinNames(top)}${bySize.length > 4 ? ', …' : ''}.`,
      { cite: [METHOD] },
    ]);
    const nearest = analysis.rankings.byDistance[0];
    const largest = bySize[0];
    if (nearest !== largest && metric(largest).sharedMarket > metric(nearest).sharedMarket) {
      paragraphs.push([
        `Closeness and size differ here: ${name(nearest)} is nearest, but ${name(largest)} shares the most in absolute terms. `,
        'Distance normalises overlap by both products’ SAMs, so a smaller product fully inside the IDV’s footprint can be closer than a larger one that shares more.',
      ]);
    } else if (comps.length > 1) {
      paragraphs.push([`${name(nearest)} is both the nearest competitor and the one with the largest modelled shared market.`]);
    }
    const exp = analysis.rankings.byCompetitorExposure[0];
    const em = metric(exp);
    if (em.competitorExposure > 0) {
      paragraphs.push([
        `Directional exposure differs by side: ${formatPercent(em.competitorExposure)} of ${em.name}’s SAM overlaps ${idvName} (the highest competitor-side exposure), `,
        `while the largest IDV-side exposure is ${formatPercent(metric(analysis.rankings.byIdvExposure[0]).idvExposure)} of ${idvName}’s SAM, from ${name(analysis.rankings.byIdvExposure[0])}.`,
      ]);
    }
    sections.push({ id: 'overlap', title: 'Largest modelled overlap', paragraphs });
  }

  // 4. IDV's largest modelled segment allocation
  {
    const idvProduct = productById.get(analysis.idvId) as Product;
    const segs = analysis.idvSegments;
    const top = segs[0];
    const paragraphs: Inline[][] = [];
    if (top) {
      const ties = segs.filter((s) => Math.abs(s.amount - top.amount) <= 1e-9 * Math.max(1, top.amount));
      paragraphs.push([
        ties.length > 1
          ? `${idvName}’s largest modelled segment allocations are tied: ${joinNames(ties.map((s) => segName(s.segmentId)))} (${q(top.amount)} each, ${formatSplitPercent(top.fraction)} of its SAM). `
          : `${idvName}’s largest modelled segment allocation is ${segName(top.segmentId)} (${q(top.amount)}, ${formatSplitPercent(top.fraction)} of its SAM). `,
        idvProduct.allocationMode === 'equal'
          ? 'Its SAM is split equally across its selected segments (the default assumption). '
          : 'This reflects the custom split entered for it. ',
        'An allocation describes the entered footprint; it does not indicate which segment is most likely to buy.',
        cite([analysis.idvId], 'segments'),
      ]);
    }
    sections.push({ id: 'idv-allocation', title: 'IDV segment allocation', paragraphs });
  }

  // 5. Directional groups (or pair relationships for small sets)
  if (comps.length > 0) {
    const paragraphs: Inline[][] = [];
    const list: Inline[][] = [];
    const directional = comps.filter((c) => !c.matchesIdv).map((c) => c.id);
    const deg = MODEL_SETTINGS.groupMaxAngleDeg;
    if (!analysis.groupingApplied) {
      if (directional.length < 2) {
        paragraphs.push(['With a single directional competitor there are no competitor-to-competitor relationships to describe yet.']);
      } else {
        paragraphs.push([
          `With fewer than ${MODEL_SETTINGS.minCompetitorsForGroups} competitors whose direction is defined, pair relationships are reported instead of forced clusters.`,
        ]);
        for (let i = 0; i < directional.length; i++) {
          for (let j = i + 1; j < directional.length; j++) {
            const a = directional[i];
            const b = directional[j];
            list.push([
              `${name(a)} and ${name(b)}: ${formatDegrees(pairNativeAngle(analysis, a, b))} apart as seen from ${idvName}; modelled distance between them ${formatDistance(pairDistance(analysis, a, b))}.`,
              { cite: [METHOD] },
            ]);
          }
        }
      }
    } else if (analysis.groups.length === 0) {
      paragraphs.push([
        `No competitors satisfy the grouping rule (every pair within ${deg}° of each other as seen from ${idvName}, and within ${MODEL_SETTINGS.groupMaxRadiusDiff} in distance from it), so each competitor occupies its own direction.`,
        { cite: [METHOD] },
      ]);
    } else {
      paragraphs.push([
        `Competitors that point in a similar direction from ${idvName} (complete link: every pair within ${deg}° and ${MODEL_SETTINGS.groupMaxRadiusDiff} in IDV distance) are grouped and ranked by their unique modelled overlap with ${idvName}, counting each market slice once.`,
        { cite: [METHOD] },
      ]);
      analysis.groups.forEach((g, k) => {
        const desc =
          g.sharedWithIdv > 0
            ? `overlap with ${idvName} mainly in ${joinNames(g.contributions.slice(0, 2).map((c) => `${segName(c.segmentId)} (${formatQuantity(c.amount)})`))}`
            : `no modelled overlap with ${idvName}; footprint led by ${joinNames(g.leadingSegments.slice(0, 2).map((c) => segName(c.segmentId)))}`;
        list.push([
          { strong: `Group ${k + 1}: ${joinNames(g.memberIds.map(name))}` },
          ` — unique shared opportunity ${q(g.sharedWithIdv)}; ${desc}; widest internal separation ${formatDegrees(g.maxAngle)}.`,
          cite(g.memberIds, 'segments'),
        ]);
      });
      const grouped = new Set(analysis.groups.flatMap((g) => g.memberIds));
      const standalone = directional.filter((id) => !grouped.has(id));
      if (standalone.length) paragraphs.push([`Not grouped: ${joinNames(standalone.map(name))}.`]);
    }
    if (analysis.matchesIdvIds.length > 0) {
      paragraphs.push([`Listed separately because their footprint matches the IDV: ${joinNames(analysis.matchesIdvIds.map(name))}.`]);
    }
    paragraphs.push(['Empty directions on the map are not market opportunities; angles here are pairwise separations, not compass bearings.']);
    sections.push({ id: 'groups', title: 'Directional groups', paragraphs, list: list.length ? list : undefined });
  }

  // 6. Crowding by segment
  if (analysis.crowding.length > 0) {
    const n = comps.length;
    const labels = n >= MODEL_SETTINGS.minCompetitorsForCrowdingLabels;
    const list: Inline[][] = analysis.crowding.map((c) => {
      const tag = c.label === 'more-crowded' ? ' — More crowded' : c.label === 'less-covered' ? ' — Less covered in this comparison' : c.label === 'moderate' ? ' — Moderately covered' : '';
      return [
        { strong: c.name },
        `: ${c.competitorCount} of ${n} competitor${n === 1 ? '' : 's'}${c.competitorCount ? ` (${joinNames(c.competitorIds.map(name))})` : ''}; `,
        c.idvAmount > 0 ? `${idvName} allocates ${q(c.idvAmount)} (${formatSplitPercent(c.idvFraction)} of its SAM)` : `${idvName} allocates nothing here`,
        `${tag}.`,
      ];
    });
    const paragraphs: Inline[][] = [
      labels
        ? [
            `Coverage counts how many competitors allocate any SAM to each segment. “More crowded” means at least ${formatPercent(MODEL_SETTINGS.crowdedShare)} of competitors are present; `,
            `“Less covered in this comparison” means at most ${formatPercent(MODEL_SETTINGS.lessCoveredShare)}. These labels describe this set of products only — not demand, profitability or an untapped market.`,
          ]
        : [
            `With fewer than ${MODEL_SETTINGS.minCompetitorsForCrowdingLabels} competitors, coverage is described by counts only; relative crowding labels would not be meaningful.`,
          ],
    ];
    sections.push({ id: 'crowding', title: 'Segment coverage', paragraphs, list });
  }

  // 7. Price context, comparable entries only
  {
    const pc = analysis.price;
    const paragraphs: Inline[][] = [];
    const list: Inline[][] = [];
    if (pc.reference && pc.comparable.length > 1) {
      paragraphs.push([
        `Prices are compared only when currency and billing basis match ${idvName}’s (${pc.reference.currency}${pc.reference.basis ? `, ${pc.reference.basis}` : ''}). Annual prices are shown as a monthly equivalent (÷12) with the original kept.`,
      ]);
      for (const e of pc.comparable) {
        list.push([
          { strong: e.name },
          `: ${e.isFree ? 'Free' : `${formatMoney(e.monthly, pc.reference.currency)} / month equivalent`}${e.fromAnnual ? ` (billed annually: ${e.original})` : ''}.`,
          cite([e.productId], 'price'),
        ]);
      }
    } else {
      const idvPrice = describePrice((productById.get(analysis.idvId) as Product).price);
      paragraphs.push([
        pc.reference
          ? `No competitor has a price in the same currency and billing basis as ${idvName} (${idvPrice}), so no price comparison is made.`
          : `${idvName}’s price is ${idvPrice.toLowerCase() === 'unknown' ? 'unknown' : `“${idvPrice}”`}, which is not a recurring published price, so no price comparison is made.`,
      ]);
    }
    const nc = pc.notComparable.filter((e) => e.productId !== analysis.idvId || !pc.reference);
    if (nc.length > 0) {
      const unknown = nc.filter((e) => e.reason === 'unknown');
      const others = nc.filter((e) => e.reason !== 'unknown');
      const note: string[] = [];
      if (others.length) note.push(`Not compared: ${others.map((e) => `${e.name} (${e.original}; ${e.reason})`).join('; ')}.`);
      if (unknown.length) note.push(`Price unknown: ${joinNames(unknown.map((e) => e.name))}.`);
      paragraphs.push([note.join(' ')]);
    }
    paragraphs.push(['Price is context only; it does not affect distances or the map.']);
    sections.push({ id: 'price', title: 'Price context', paragraphs, list: list.length ? list : undefined });
  }

  // 8. Assumptions, sources, freshness and map error
  const analysedProducts = analysis.productIds.map((id) => productById.get(id) as Product);
  const unsourced = analysedProducts.filter((p) => p.sources.length === 0).map((p) => p.name);
  {
    const paragraphs: Inline[][] = [];
    const statusCounts = new Map<string, number>();
    for (const p of analysedProducts) statusCounts.set(p.evidenceStatus, (statusCounts.get(p.evidenceStatus) ?? 0) + 1);
    paragraphs.push([
      `Evidence status of analysed inputs: ${[...statusCounts.entries()].map(([s, c]) => `${c} ${s}`).join(', ')}. `,
      unsourced.length
        ? `No references are attached to ${joinNames(unsourced)}; ${unsourced.length === 1 ? 'its inputs are' : 'their inputs are'} unsourced estimates. `
        : 'Every analysed product has at least one user-entered reference. ',
      'References are recorded as entered and have not been checked by this app; a link does not verify the whole product record.',
    ]);
    const withSom = analysedProducts.filter((p) => p.som !== null);
    paragraphs.push([
      withSom.length
        ? `SOM scenario estimates are entered for ${joinNames(withSom.map((p) => `${p.name} (${q(p.som as number)}${p.somHorizon ? `, ${p.somHorizon}` : ''})`))}. SOM is a scenario, not current users or measured market share. `
        : 'No SOM estimates are entered; blank SOM means unknown, not zero. ',
    ]);
    if (diagnostics) {
      const worst = diagnostics.worstPair;
      paragraphs.push([
        `The radial map keeps every competitor at its exact distance from ${idvName}. Competitor-to-competitor distances are fitted in two dimensions with a map distance error of ${formatPercent(diagnostics.relativeRMSError, 1)} (relative RMS over all pairs)`,
        worst
          ? `; the largest single difference is ${formatDistance(Math.abs(worst.residual))}, between ${name(worst.a)} and ${name(worst.b)}. `
          : '; all pairs are reproduced within rounding. ',
        'Use the relationship table, not the map, for exact values.',
        { cite: [METHOD] },
      ]);
    } else {
      paragraphs.push(['The radial map is still being fitted; exact distances above do not depend on it.']);
    }
    paragraphs.push([
      `Inputs last updated ${formatDate(project.updatedAt)} (revision ${project.revision}). Model ${MODEL_VERSION}.`,
    ]);
    sections.push({ id: 'assumptions', title: 'Assumptions and data quality', paragraphs });
  }

  return { sections, references, unsourced };
}

/** Plain-text rendering, used for tests and accessible summaries. */
export function inlineToText(runs: readonly Inline[]): string {
  return runs
    .map((r) => (typeof r === 'string' ? r : 'strong' in r ? r.strong : ` [${r.cite.map((c) => c.label).join(', ')}]`))
    .join('');
}
