// ── Phase 0.3: pre-resolve places ──────────────────────────────────────────

import { runBatch } from '../../../api/db';
import { bulkAddExternalIdentifiers } from '../../../api/external_identifiers';
import { bulkResolvePlaces } from '../../../api/places';
import { bulkResolveHierarchy, type HierarchyLevel } from '../../../api/places_hierarchy';
import type { GedcomNode } from '../../../gedcom/parser';
import type { ImportContext } from '../import-types';
import { parseAdpl, parseAdplJudicial } from '../profiles/arkivdigital';

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Every PLAC node in the tree, in document order. */
function collectPlacNodes(nodes: GedcomNode[], out: GedcomNode[] = []): GedcomNode[] {
  for (const n of nodes) {
    if (n.tag === 'PLAC' && n.value) out.push(n);
    if (n.children.length > 0) collectPlacNodes(n.children, out);
  }
  return out;
}

/**
 * Walk every PLAC tag in the tree, deduplicate by normalized name, and bulk-
 * resolve to existing or freshly-inserted Place rows. Stores the result in
 * `ctx.prefetchedPlaces` keyed by normalized name. `ctx.resolvePlaceFn` is
 * then overridden so per-event lookups become Map.get() — zero IPC per
 * event, instead of `findOrCreatePlace`'s SELECT + maybe INSERT.
 *
 * Skipped for Genney imports — they use a different resolver that handles
 * hierarchical "Stockholm, Sverige (X)" parsing; pre-resolution would have
 * to mirror that logic. For Holger and plain GEDCOM (the dominant case),
 * this collapses 60-100k+ IPC calls into 2.
 *
 * **ArkivDigital takes the hierarchy branch.** Its `_ADPL` block states the
 * hierarchy explicitly, so the chain is resolved into a real parent/child tree
 * and the map is keyed by the PLAC *display string*. Keying by display string
 * is what keeps the change local: `event-importer.ts` still calls
 * `resolvePlaceFn(db, placeName)` with the PLAC value, still gets a Map.get
 * hit, and never learns the hierarchy exists.
 */
export async function phasePrepPlaces(ctx: ImportContext): Promise<void> {
  if (ctx.isGenney) return;

  const placNodes = collectPlacNodes(ctx.tree);
  if (placNodes.length === 0) return;

  const placeMap = new Map<string, Awaited<ReturnType<typeof bulkResolvePlaces>> extends Map<string, infer P> ? P : never>();

  // ── ArkivDigital: resolve the explicit _ADPL hierarchy first ─────────────
  // Tag-driven, not vendor-driven: any PLAC carrying an _ADPL block takes the
  // hierarchy path. That includes this app's own exports, which reconstruct the
  // block from stored parent links — without it the hierarchy would not survive
  // a round-trip through our own exporter.
  const flatNodes: GedcomNode[] = [];
  const anyAdpl = placNodes.some(n => n.children.some(c => c.tag === '_ADPL'));
  if (ctx.isArkivDigital || anyAdpl) {
    const chains: HierarchyLevel[][] = [];
    const displayByChainKey = new Map<string, string[]>();
    const judicialByChainKey = new Map<string, string>();

    for (const node of placNodes) {
      const levels = parseAdpl(node);
      if (!levels || levels.length === 0) { flatNodes.push(node); continue; }
      const key = levels.map(l => l.name).join(' > ');
      if (!displayByChainKey.has(key)) {
        chains.push(levels);
        displayByChainKey.set(key, []);
      }
      displayByChainKey.get(key)!.push(node.value.trim());
      const judicial = parseAdplJudicial(node);
      if (judicial && !judicialByChainKey.has(key)) judicialByChainKey.set(key, judicial);
    }

    if (chains.length > 0) {
      ctx.options?.onProgress?.(`Förbereder ${chains.length} platser…`);
      const resolved = await bulkResolveHierarchy(ctx.db, chains);
      const externalIds: Array<{ placeId: string; externalId: string }> = [];
      for (const [key, chain] of resolved) {
        for (const display of displayByChainKey.get(key) ?? []) {
          placeMap.set(normalize(display), chain.place);
        }
        externalIds.push(...chain.externalIds);
      }
      ctx.placeExternalIds = externalIds;
      // `_PARISH_AID` — round-trip only, flushed once for the whole tree.
      if (externalIds.length > 0) {
        await bulkAddExternalIdentifiers(ctx.db, externalIds.map(e => ({
          entity_type: 'place', entity_id: e.placeId,
          system: 'arkivdigital.parish', value: e.externalId,
        })));
      }

      // _JUDICIAL is the härad of a probate — an attribute of the parish, not a
      // container it sits inside. `places` has no column for it and eight
      // occurrences across four real exports do not warrant one, so it goes in
      // the parish's notes. Applied here in one batch, not per place.
      const chainByKey = new Map(chains.map(c => [c.map(l => l.name).join(' > '), c]));
      const judicialUpdates: Array<[string, string]> = [];
      const judicialSeen = new Set<string>();
      for (const [key, judicial] of judicialByChainKey) {
        const chain = resolved.get(key);
        const levels = chainByKey.get(key);
        if (!chain || !levels) continue;
        const parishIdx = levels.findIndex(l => l.type === 'parish');
        if (parishIdx < 0) continue;
        const parishId = chain.placeIdsByDepth[parishIdx];
        if (!parishId || judicialSeen.has(parishId)) continue;
        judicialSeen.add(parishId);
        judicialUpdates.push([`Härad: ${judicial}`, parishId]);
      }
      if (judicialUpdates.length > 0) {
        await runBatch(
          ctx.db,
          "UPDATE places SET notes = CASE WHEN notes = '' THEN ? ELSE notes || char(10) || ? END WHERE id = ?",
          judicialUpdates.map(([text, id]) => [text, text, id]),
        );
      }
      console.log(`[import-timing]     phasePrepPlaces: resolved ${chains.length} ArkivDigital place chains`);
    }
  }

  // ── Everything else: the flat display-string path ────────────────────────
  const names: string[] = [];
  const seen = new Set<string>();
  for (const n of ((ctx.isArkivDigital || anyAdpl) ? flatNodes : placNodes)) {
    const trimmed = n.value.trim();
    if (trimmed && !seen.has(trimmed)) { seen.add(trimmed); names.push(trimmed); }
  }
  if (names.length > 0) {
    ctx.options?.onProgress?.(`Förbereder ${names.length} platser…`);
    const flatMap = await bulkResolvePlaces(ctx.db, names);
    for (const [k, v] of flatMap) placeMap.set(k, v);
    console.log(`[import-timing]     phasePrepPlaces: resolved ${names.length} unique places`);
  }

  if (placeMap.size === 0) return;
  ctx.prefetchedPlaces = placeMap;

  // Wrap the original resolver — Map.get on hit, fall through on miss
  // (e.g. ADDR-derived names that didn't show up in any PLAC).
  const originalResolve = ctx.resolvePlaceFn;
  ctx.resolvePlaceFn = async (db, name) => {
    const cached = placeMap.get(normalize(name));
    if (cached) return cached;
    const created = await originalResolve(db, name);
    placeMap.set(normalize(created.name), created);
    return created;
  };
}
