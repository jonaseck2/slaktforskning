// ── Phase 0.3: pre-resolve places ──────────────────────────────────────────

import { runBatch } from '../../../api/db';
import { bulkAddExternalIdentifiers } from '../../../api/external_identifiers';
import { bulkResolvePlaces } from '../../../api/places';
import { bulkResolveHierarchy, type HierarchyLevel } from '../../../api/places_hierarchy';
import type { GedcomNode } from '../../../gedcom/parser';
import type { ImportContext } from '../import-types';
import { getChild } from '../node-utils';
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
 * Every PLAC node together with the PARI sibling on its owner, in document
 * order. Holger writes the parish beside the place rather than inside it:
 *
 *   1 BIRT
 *   2 PLAC Stockholm
 *   2 PARI Stockholms domkyrkoförsamling (A)
 *
 * `GedcomNode` carries no parent pointer (`src/gedcom/parser.ts` has level,
 * xref, tag, value, children and nothing else), so the pairing has to happen
 * during the walk — the owner is in hand exactly once, here. `collectPlacNodes`
 * above throws the owner away and therefore cannot reach the parish.
 *
 * Every node is visited twice, once as a child and once as an owner. That is a
 * walk over parsed nodes rather than a DB query, and `collectPlacNodes` already
 * walks the same tree, so it costs nothing measurable. Do not make it clever.
 */
function collectPlacWithParish(
  nodes: GedcomNode[],
  out: Array<{ placNode: GedcomNode; parish: string | null }> = [],
): Array<{ placNode: GedcomNode; parish: string | null }> {
  for (const owner of nodes) {
    for (const child of owner.children) {
      if (child.tag === 'PLAC' && child.value) {
        // getChild marks the node consumed — that is what removes PARI from
        // the unaccounted set. A raw children.find() would leave it reported.
        out.push({ placNode: child, parish: getChild(owner, 'PARI')?.value?.trim() || null });
      }
    }
    if (owner.children.length > 0) collectPlacWithParish(owner.children, out);
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
  const takesAdplPath = ctx.isArkivDigital || anyAdpl;
  // Same rule as the ArkivDigital branch: tag-driven, not vendor-driven. PARI
  // is not a standard GEDCOM tag and Holger is the only program known to write
  // it, so reading it wherever it appears is safe — and it means the parish
  // survives an import the user ran through the plain GEDCOM path without
  // selecting the Holger profile, which is the import most people perform.
  const anyPari = placNodes.length > 0
    && collectPlacWithParish(ctx.tree).some(e => e.parish !== null);
  const takesParishPath = !takesAdplPath && (ctx.isHolger || anyPari);
  if (takesAdplPath) {
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

  // ── Holger: PLAC + its PARI sibling become a two-level chain ─────────────
  //
  // **Risk this branch takes, stated where the code is.** For every observed
  // case the parish contains the named place, so the chain is
  // `Stockholm > Stockholms domkyrkoförsamling`. For a rural record — a farm in
  // PLAC, its parish in PARI — the containment runs the other way, and no
  // available evidence settles which Holger actually emits: Holger is
  // Windows-only and paid, and zero PARI tags appear across the 36 real .ged
  // files in export-import/samples. The fixture is the only evidence there is.
  //
  // This direction is right for every case observed, and it preserves both
  // values where dropping preserves neither. Reversing it later is one
  // `reverse()` plus a migration for whoever imported in between.
  //
  // **Unblocking measurement, when a real Holger export arrives:** count the
  // records whose PARI value contains the PLAC value as a substring against the
  // reverse. If the reverse dominates, flip the chain and ship a migration.
  //
  // `else if` on the same chain as the ArkivDigital branch: a file carrying
  // both _ADPL and PARI must not resolve the same PLAC twice.
  else if (takesParishPath) {
    const chains: HierarchyLevel[][] = [];
    const displayByChainKey = new Map<string, string[]>();
    for (const { placNode, parish } of collectPlacWithParish(ctx.tree)) {
      if (!parish) { flatNodes.push(placNode); continue; }
      const levels: HierarchyLevel[] = [
        // The PLAC level gets no type. `PLAC Stockholm` states a name, not a
        // kind — town, village and farm are all written the same way, and
        // guessing one would be an inference the file never made. PARI does
        // state its kind: the tag itself says parish.
        { name: placNode.value.trim(), type: null },
        { name: parish,                type: 'parish' },
      ];
      const key = levels.map(l => l.name).join(' > ');
      if (!displayByChainKey.has(key)) {
        chains.push(levels);
        displayByChainKey.set(key, []);
      }
      displayByChainKey.get(key)!.push(placNode.value.trim());
    }
    if (chains.length > 0) {
      ctx.options?.onProgress?.(`Förbereder ${chains.length} platser…`);
      // One call for the whole tree, matching the ArkivDigital branch above —
      // `.claude/rules/performance.md`, never one query per event.
      const resolved = await bulkResolveHierarchy(ctx.db, chains);
      for (const [key, chain] of resolved) {
        for (const display of displayByChainKey.get(key) ?? []) {
          // Key by the PLAC display string so event-importer.ts needs no
          // change: it still calls resolvePlaceFn(db, placValue), still gets a
          // Map.get hit, and never learns the hierarchy exists. Same trick the
          // ArkivDigital branch uses.
          placeMap.set(normalize(display), chain.place);
        }
      }
      console.log(`[import-timing]     phasePrepPlaces: resolved ${chains.length} Holger parish chains`);
    }
  }

  // ── Everything else: the flat display-string path ────────────────────────
  const names: string[] = [];
  const seen = new Set<string>();
  for (const n of ((takesAdplPath || takesParishPath) ? flatNodes : placNodes)) {
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
