/**
 * Deterministic written summary built only from structured metrics. No LLM. Every claim
 * carries references to the inputs (and methodology) it derives from.
 */
import type { Analysis } from '../domain/analysis';
import type { LayoutDiagnostics } from '../domain/diagnostics';
import { formatAmount, formatDate, formatDegrees, formatDistance, formatShare, listJoin, plural } from '../domain/format';
import { formatMoney, formatPrice } from '../domain/price';
import { MODEL_SETTINGS } from '../domain/settings';
import type { Product, Project, Source, SourceTopic } from '../domain/types';
import type { MethodSection } from './methodology';

export type CiteRef =
  | { kind: 'product'; productId: string; topics: SourceTopic[] }
  | { kind: 'project'; topics: SourceTopic[] }
  | { kind: 'all-products' }
  | { kind: 'method'; section: MethodSection };

export interface Claim {
  text: string;
  refs: CiteRef[];
}

export interface NarrativeTable {
  columns: string[];
  rows: string[][];
  /** Optional per-row tone used for the crowding illustration. */
  tones?: (('more' | 'less' | null))[];
}

export interface NarrativeSection {
  id: string;
  heading: string;
  claims: Claim[];
  table?: NarrativeTable;
}

export interface ReferenceEntry {
  key: string;
  number: number;
  kind: CiteRef['kind'];
  label: string;
  productId?: string;
  methodSection?: MethodSection;
  evidenceStatus?: string;
  topics: SourceTopic[];
  sources: Source[];
}

export interface Narrative {
  sections: NarrativeSection[];
  references: ReferenceEntry[];
  /** Claim citation numbers, aligned with sections[i].claims[j]. */
  citations: number[][][];
}

const EVIDENCE_LABEL: Record<string, string> = { estimated: 'Estimated', planned: 'Planned', sourced: 'Sourced', illustrative: 'Illustrative' };

function refKey(r: CiteRef): string {
  switch (r.kind) {
    case 'product':
      return `p:${r.productId}`;
    case 'project':
      return 'project';
    case 'all-products':
      return 'all';
    case 'method':
      return `m:${r.section}`;
  }
}

export function relevantSources(sources: readonly Source[], topics: readonly SourceTopic[]): Source[] {
  return sources.filter((s) => !s.appliesTo || s.appliesTo.length === 0 || s.appliesTo.includes('general') || s.appliesTo.some((t) => topics.includes(t)));
}

export function buildNarrative(project: Project, analysis: Analysis, diagnostics: LayoutDiagnostics | null): Narrative {
  const unit = project.marketUnit;
  const P = (id: string) => analysis.products.get(id) as Product;
  const name = (id: string) => P(id).name;
  const idv = name(analysis.idvId);
  const segName = new Map(project.segments.map((s) => [s.id, s.name]));
  const metrics = new Map(analysis.competitors.map((c) => [c.productId, c]));
  const n = analysis.competitorIds.length;
  const amt = (v: number) => `${formatAmount(v)} ${unit}`;
  const projectOrder = new Map(project.products.map((p, i) => [p.id, i]));
  const ordered = (ids: readonly string[]) => [...ids].sort((a, b) => (projectOrder.get(a) ?? 0) - (projectOrder.get(b) ?? 0));
  const inputs = (id: string, topics: SourceTopic[] = ['sam', 'segments']): CiteRef => ({ kind: 'product', productId: id, topics });
  const method = (section: MethodSection): CiteRef => ({ kind: 'method', section });
  const many = (ids: string[], topics: SourceTopic[] = ['sam', 'segments']): CiteRef[] =>
    ids.length <= 6 ? ids.map((id) => inputs(id, topics)) : [{ kind: 'all-products' }];

  const sections: NarrativeSection[] = [];

  // 1. Scope.
  {
    const claims: Claim[] = [];
    const market = project.marketDescription.trim();
    claims.push({
      text:
        `This comparison covers ${plural(n + 1, 'product')} — ${idv} (the IDV) and ${plural(n, 'competitor')} — against a TAM of ${amt(analysis.tam)} (reference: ${project.referenceDate || 'not set'}).` +
        (market ? ` Market: ${market}` : ''),
      refs: [{ kind: 'project', topics: ['tam'] }],
    });
    claims.push({
      text: 'Distances, overlaps, and groups are modeled from each product’s SAM and segment split, assuming the smaller addressed population in a shared segment sits inside the larger one (maximum overlap). They are estimates, not observed customer overlap.',
      refs: [method('overlap'), method('distance')],
    });
    let unionText = `Together the analyzed footprints cover a modeled ${amt(analysis.modeledUnion)} (${formatShare(analysis.modeledUnion / analysis.tam)} of TAM). TAM minus this modeled union leaves ${amt(analysis.outsideModeled)} outside the modeled footprints; that is not evidence of unmet demand.`;
    if (analysis.sumOfSams > analysis.tam) {
      unionText += ` Summed SAMs (${formatAmount(analysis.sumOfSams)}) exceed TAM because footprints overlap; each modeled segment slice is counted once.`;
    }
    claims.push({ text: unionText, refs: [{ kind: 'project', topics: ['tam'] }, ...many(analysis.order), method('union')] });
    if (analysis.excludedIds.length) {
      const excluded = analysis.excludedIds.map((id) => project.products.find((p) => p.id === id)?.name || 'Unnamed product');
      claims.push({ text: `Not yet analyzed because a SAM or segment is missing: ${listJoin(excluded)}.`, refs: [] });
    }
    if (project.isExample) {
      claims.push({ text: 'This is a fictional example. Its numbers are illustrative and do not describe real companies, markets, usage, prices, or capabilities.', refs: [] });
    }
    sections.push({ id: 'scope', heading: 'Scope', claims });
  }

  if (n === 0) {
    sections.push({ id: 'next', heading: 'Next step', claims: [{ text: `Add a competitor to compare it with ${idv}.`, refs: [] }] });
    return finalize(project, analysis, sections, diagnostics);
  }

  // 2. Nearest competitors.
  {
    const claims: Claim[] = [];
    const matching = analysis.grouping.matchingIdvIds;
    if (matching.length) {
      claims.push({
        text: `${listJoin(ordered(matching).map(name))} ${matching.length === 1 ? 'has' : 'have'} the same modeled footprint as ${idv} (distance 0).`,
        refs: [inputs(analysis.idvId), ...many(matching), method('distance')],
      });
    }
    const nearest = analysis.rankings.byDistance.filter((id) => !metrics.get(id)!.matchesIdv).slice(0, 3);
    if (nearest.length) {
      claims.push({
        text: `Nearest by modeled distance: ${listJoin(nearest.map((id) => `${name(id)} (${formatDistance(metrics.get(id)!.distance)})`))}.`,
        refs: [inputs(analysis.idvId), ...nearest.map((id) => inputs(id)), method('distance')],
      });
      const first = metrics.get(nearest[0])!;
      claims.push({
        text:
          first.sharedMarket > 0
            ? `${name(first.productId)} shares a modeled ${amt(first.sharedMarket)} with ${idv}: ${formatShare(first.idvExposure)} of ${idv}’s SAM and ${formatShare(first.competitorExposure)} of ${name(first.productId)}’s own.`
            : `${name(first.productId)} shares no modeled segment with ${idv}.`,
        refs: [inputs(analysis.idvId), inputs(first.productId), method('exposure')],
      });
    }
    sections.push({ id: 'nearest', heading: 'Nearest competitors', claims });
  }

  // 3. Largest absolute overlap (kept distinct from closeness).
  {
    const claims: Claim[] = [];
    const largest = analysis.rankings.bySharedMarket.filter((id) => metrics.get(id)!.sharedMarket > 0).slice(0, 3);
    if (!largest.length) {
      claims.push({ text: `No competitor shares a modeled segment with ${idv}.`, refs: [inputs(analysis.idvId), method('overlap')] });
    } else {
      claims.push({
        text: `Largest absolute modeled overlap with ${idv}: ${listJoin(largest.map((id) => `${name(id)} (${formatAmount(metrics.get(id)!.sharedMarket)})`))}.`,
        refs: [inputs(analysis.idvId), ...largest.map((id) => inputs(id)), method('exposure')],
      });
      const closest = analysis.rankings.byDistance[0];
      if (largest[0] !== closest && !metrics.get(closest)!.matchesIdv) {
        const a = metrics.get(closest)!;
        const b = metrics.get(largest[0])!;
        claims.push({
          text: `Closest is not the same as largest: ${name(closest)} is nearest (${formatDistance(a.distance)}), while ${name(largest[0])} shares the most market (${formatAmount(b.sharedMarket)} vs ${formatAmount(a.sharedMarket)}). Distance also reflects how much of each footprint lies outside the other.`,
          refs: [inputs(closest), inputs(largest[0]), method('exposure')],
        });
      }
      const topExp = analysis.rankings.byCompetitorExposure[0];
      const e = metrics.get(topExp)!;
      if (e.competitorExposure > 0) {
        claims.push({
          text: `Highest competitor exposure: ${formatShare(e.competitorExposure)} of ${name(topExp)}’s modeled SAM lies within ${idv}’s footprint.`,
          refs: [inputs(analysis.idvId), inputs(topExp), method('exposure')],
        });
      }
    }
    sections.push({ id: 'overlap', heading: 'Largest modeled overlap', claims });
  }

  // 4. IDV's largest modeled segment allocation.
  {
    const segs = analysis.idvSegments;
    const top = segs.filter((s) => Math.abs(s.amount - segs[0].amount) <= 1e-9 * Math.max(1, segs[0].amount));
    const idvProduct = P(analysis.idvId);
    let text =
      top.length === 1
        ? `${idv}’s largest modeled segment allocation is ${segName.get(top[0].segmentId)} (${amt(top[0].amount)}; ${formatShare(top[0].fraction)} of its SAM).`
        : `${idv}’s largest modeled segment allocations tie: ${listJoin(top.map((s) => segName.get(s.segmentId) as string))} (${amt(top[0].amount)} each).`;
    if (idvProduct.allocationMode === 'equal' && segs.length > 1) text += ` This comes from the default equal split across its ${segs.length} selected segments.`;
    text += ' It reflects the entered split, not which customers are most likely to buy.';
    sections.push({ id: 'idv-segment', heading: 'IDV segment allocation', claims: [{ text, refs: [inputs(analysis.idvId, ['segments', 'sam'])] }] });
  }

  // 5. Directional groups.
  {
    const claims: Claim[] = [];
    const gr = analysis.grouping;
    if (gr.mode === 'pairs') {
      for (const p of gr.pairs) {
        claims.push({
          text: `Seen from ${idv}, ${name(p.a)} and ${name(p.b)} are ${formatDegrees(p.angle)} apart (native angle). With fewer than ${MODEL_SETTINGS.grouping.minCompetitorsForGroups} directional competitors, pairs are reported rather than groups.`,
          refs: [inputs(p.a), inputs(p.b), method('angles')],
        });
      }
    } else if (gr.mode === 'groups') {
      const multi = gr.groups.filter((g) => g.memberIds.length > 1);
      const singles = gr.groups.filter((g) => g.memberIds.length === 1);
      multi.forEach((g, k) => {
        const segText = g.sharedBySegment
          .slice(0, 2)
          .map((s) => `${segName.get(s.segmentId)} (${formatAmount(s.amount)})`);
        claims.push({
          text:
            `Group ${k + 1}: ${listJoin(g.memberIds.map(name))} point in a similar direction from ${idv} (every pair within ${formatDegrees(g.maxAngle)}). ` +
            (g.shared > 0
              ? `Together they overlap ${idv} on a unique ${amt(g.shared)}, mostly ${listJoin(segText)}.`
              : `Together they share no modeled segment with ${idv}.`),
          refs: [...many(g.memberIds), method('grouping')],
        });
      });
      if (!multi.length) {
        claims.push({
          text: `No two competitors are similar enough in direction to group (within ${MODEL_SETTINGS.grouping.maxAngleDeg}° and ${MODEL_SETTINGS.grouping.maxRadiusDiff} distance of each other); each occupies a distinct direction.`,
          refs: [method('grouping')],
        });
      } else if (singles.length) {
        claims.push({ text: `Distinct directions: ${listJoin(singles.map((g) => name(g.memberIds[0])))}.`, refs: [method('grouping')] });
      }
      const ranked = gr.groups.filter((g) => g.shared > 0);
      if (ranked.length) {
        claims.push({
          text: `Ranked by unique modeled overlap with ${idv}: ${listJoin(ranked.slice(0, 5).map((g) => `${listJoin(g.memberIds.map(name))} (${formatAmount(g.shared)})`))}.`,
          refs: [method('grouping')],
        });
      }
    } else {
      claims.push({ text: 'There are not enough competitors with a defined direction to compare directions.', refs: [method('angles')] });
    }
    if (gr.matchingIdvIds.length && gr.mode !== 'none') {
      claims.push({ text: `Matching ${idv}’s footprint (direction undefined): ${listJoin(ordered(gr.matchingIdvIds).map(name))}.`, refs: [method('angles')] });
    }
    claims.push({ text: 'Empty areas of the map are not market opportunities; native angles are pairwise separations, not compass bearings.', refs: [method('angles')] });
    sections.push({ id: 'groups', heading: 'Directional groups', claims });
  }

  // 6. Crowding by segment.
  {
    const claims: Claim[] = [];
    const covered = analysis.crowding.filter((c) => c.competitorIds.length > 0 || c.idvAmount > 0);
    const describe = (c: (typeof covered)[number]) =>
      `${segName.get(c.segmentId)} (${c.competitorIds.length} of ${n}; ${idv} allocates ${formatAmount(c.idvAmount)})`;
    if (analysis.crowdingMean !== null) {
      const more = covered.filter((c) => c.label === 'more-crowded');
      const less = covered.filter((c) => c.label === 'less-covered');
      if (more.length) claims.push({ text: `More crowded: ${listJoin(more.map(describe))}.`, refs: [...many(analysis.order, ['segments']), method('crowding')] });
      if (less.length) claims.push({ text: `Less covered in this comparison: ${listJoin(less.map(describe))}.`, refs: [...many(analysis.order, ['segments']), method('crowding')] });
      claims.push({
        text: `Labels compare each segment’s competitor count with the average across covered segments (${analysis.crowdingMean.toFixed(2)}). They describe the entered footprints, not demand, profitability, or an untapped market.`,
        refs: [method('crowding')],
      });
    } else {
      claims.push({
        text: `Competitors with a positive allocation: ${listJoin(covered.map(describe))}. With fewer than ${MODEL_SETTINGS.crowding.minCompetitorsForLabels} competitors, no relative crowding labels are given.`,
        refs: [...many(analysis.order, ['segments']), method('crowding')],
      });
    }
    const table: NarrativeTable = {
      columns: ['Segment', 'Competitors with allocation', `${idv} (IDV) allocation`, 'Coverage'],
      rows: covered.map((c) => [
        segName.get(c.segmentId) as string,
        c.competitorIds.length ? `${c.competitorIds.length}: ${c.competitorIds.map(name).join(', ')}` : '0',
        c.idvAmount > 0 ? `${formatAmount(c.idvAmount)} (${formatShare(c.idvFraction)})` : '0',
        c.label === 'more-crowded' ? 'More crowded' : c.label === 'less-covered' ? 'Less covered in this comparison' : c.label === 'typical' ? 'About average' : '—',
      ]),
      tones: covered.map((c) => (c.label === 'more-crowded' ? 'more' : c.label === 'less-covered' ? 'less' : null)),
    };
    sections.push({ id: 'crowding', heading: 'Segment coverage', claims, table });
  }

  // 7. Price context — comparable entries only.
  {
    const claims: Claim[] = [];
    const pr = analysis.price;
    for (const g of pr.groups) {
      const recurring = g.cadence === 'recurring';
      const items = g.entries.map((e) => {
        if (recurring && e.period === 'year') {
          return `${name(e.productId)} ${formatMoney(e.monthlyEquivalent as number, e.currency)}/month equivalent (${formatMoney(e.amount, e.currency)} billed annually)`;
        }
        return `${name(e.productId)} ${formatMoney(e.amount, e.currency)}${recurring ? '/month' : g.cadence === 'one-time' ? ' one-time' : ' usage-based'}`;
      });
      claims.push({ text: `Comparable prices (${g.currency}, ${g.basis}): ${listJoin(items)}.`, refs: g.entries.map((e) => inputs(e.productId, ['price'])) });
    }
    if (pr.standalone.length) {
      claims.push({
        text: `No comparable counterpart (different currency, basis, or billing type): ${listJoin(pr.standalone.map((e) => `${name(e.productId)} (${formatPrice(P(e.productId).price)})`))}.`,
        refs: pr.standalone.map((e) => inputs(e.productId, ['price'])),
      });
    }
    if (pr.free.length) claims.push({ text: `Free: ${listJoin(ordered(pr.free).map(name))}.`, refs: pr.free.map((id) => inputs(id, ['price'])) });
    if (pr.quote.length) claims.push({ text: `Contact for quote (not ranked): ${listJoin(ordered(pr.quote).map(name))}.`, refs: pr.quote.map((id) => inputs(id, ['price'])) });
    if (pr.incomplete.length) claims.push({ text: `Published price missing amount, currency, period, or basis (not compared): ${listJoin(ordered(pr.incomplete).map(name))}.`, refs: [] });
    if (pr.unknown.length) claims.push({ text: `Price unknown (not ranked): ${listJoin(ordered(pr.unknown).map(name))}.`, refs: [] });
    if (!pr.groups.length) claims.unshift({ text: 'No directly comparable published prices were entered.', refs: [] });
    claims.push({ text: 'Price is context only and does not affect distances.', refs: [method('price')] });
    sections.push({ id: 'price', heading: 'Price context', claims });
  }

  return finalize(project, analysis, sections, diagnostics);
}

function finalize(project: Project, analysis: Analysis, sections: NarrativeSection[], diagnostics: LayoutDiagnostics | null): Narrative {
  const name = (id: string) => analysis.products.get(id)?.name ?? id;
  const method = (section: MethodSection): CiteRef => ({ kind: 'method', section });
  const claims: Claim[] = [];
  const projectOrder = new Map(project.products.map((p, i) => [p.id, i]));
  const products = [...analysis.products.values()].sort((a, b) => (projectOrder.get(a.id) ?? 0) - (projectOrder.get(b.id) ?? 0));
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.evidenceStatus, (counts.get(p.evidenceStatus) ?? 0) + 1);
  claims.push({
    text: `Evidence status: ${[...counts.entries()].map(([k, v]) => `${v} ${EVIDENCE_LABEL[k].toLowerCase()}`).join(', ')}. A source link alone does not verify a whole product record.`,
    refs: [],
  });
  const unsourced = products.filter((p) => p.sources.length === 0);
  claims.push({
    text:
      unsourced.length === 0
        ? 'Every analyzed product has at least one source reference.'
        : `${unsourced.length} of ${products.length} analyzed products have no source references; their inputs are unsourced estimates${unsourced.length <= 8 ? ` (${listJoin(unsourced.map((p) => p.name))})` : ''}.`,
    refs: [],
  });
  const withSom = products.filter((p) => p.som !== null);
  claims.push({
    text: withSom.length
      ? `SOM is entered for ${withSom.length} of ${products.length} products as scenario estimates — not current users or measured market share.`
      : 'No SOM estimates were entered (blank means unknown, not zero).',
    refs: withSom.length ? [method('price')] : [],
  });
  if (diagnostics) {
    const w = diagnostics.worstPair;
    claims.push({
      text:
        `Map distance error: ${formatShare(diagnostics.relativeRMSError)} relative RMS over all plotted pairs` +
        (w ? `; largest gap ${name(w.a)} ↔ ${name(w.b)} (shown ${formatDistance(w.displayed)} vs modeled ${formatDistance(w.native)}).` : '.') +
        ' IDV distances are exact; the map approximates competitor-to-competitor distances. This is projection distortion, not data confidence.',
      refs: [method('layout')],
    });
  } else {
    claims.push({ text: 'The radial map has not been fitted yet, so map distance error is not available.', refs: [method('layout')] });
  }
  claims.push({ text: `Last updated ${formatDate(project.updatedAt)}. Source links are user-entered and have not been checked by this app.`, refs: [] });
  sections.push({ id: 'assumptions', heading: 'Assumptions and data quality', claims });

  // Number references in order of first appearance.
  const references: ReferenceEntry[] = [];
  const byKey = new Map<string, ReferenceEntry>();
  const citations = sections.map((s) =>
    s.claims.map((c) => {
      const nums: number[] = [];
      for (const r of c.refs) {
        const key = refKey(r);
        let entry = byKey.get(key);
        if (!entry) {
          entry = makeEntry(project, analysis, r, references.length + 1);
          byKey.set(key, entry);
          references.push(entry);
        }
        if (r.kind === 'product' || r.kind === 'project') {
          for (const t of r.topics) if (!entry.topics.includes(t)) entry.topics.push(t);
        }
        if (!nums.includes(entry.number)) nums.push(entry.number);
      }
      return nums;
    }),
  );
  for (const e of references) {
    if (e.kind === 'product' && e.productId) {
      const p = analysis.products.get(e.productId);
      e.sources = p ? relevantSources(p.sources, e.topics) : [];
    } else if (e.kind === 'project') {
      e.sources = relevantSources(project.sources, e.topics);
    }
  }
  return { sections, references, citations };
}

function makeEntry(project: Project, analysis: Analysis, r: CiteRef, number: number): ReferenceEntry {
  switch (r.kind) {
    case 'product': {
      const p = analysis.products.get(r.productId);
      const isIdv = r.productId === analysis.idvId;
      return {
        key: refKey(r),
        number,
        kind: 'product',
        label: `${p?.name ?? 'Product'}${isIdv ? ' (IDV)' : ''} — entered inputs`,
        productId: r.productId,
        evidenceStatus: p ? EVIDENCE_LABEL[p.evidenceStatus] : undefined,
        topics: [],
        sources: [],
      };
    }
    case 'project':
      return { key: 'project', number, kind: 'project', label: `Project TAM and market definition (${project.name})`, topics: [], sources: [] };
    case 'all-products':
      return { key: 'all', number, kind: 'all-products', label: 'All analyzed products’ SAM and segment inputs (see the inputs table)', topics: [], sources: [] };
    case 'method':
      return { key: refKey(r), number, kind: 'method', label: 'Methodology', methodSection: r.section, topics: [], sources: [] };
  }
}
