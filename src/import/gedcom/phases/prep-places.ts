// ── Phase 0.3: pre-resolve places ──────────────────────────────────────────

import { bulkResolvePlaces } from '../../../api/places';
import type { ImportContext } from '../import-types';

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
 */
export async function phasePrepPlaces(ctx: ImportContext): Promise<void> {
  if (ctx.isGenney) return;

  const names: string[] = [];
  const seen = new Set<string>();
  function walk(nodes: typeof ctx.tree): void {
    for (const n of nodes) {
      if (n.tag === 'PLAC' && n.value) {
        const trimmed = n.value.trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          names.push(trimmed);
        }
      }
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(ctx.tree);
  if (names.length === 0) return;

  ctx.options?.onProgress?.(`Förbereder ${names.length} platser…`);
  const placeMap = await bulkResolvePlaces(ctx.db, names);
  ctx.prefetchedPlaces = placeMap;

  // Wrap the original resolver — Map.get on hit, fall through on miss
  // (e.g. ADDR-derived names that didn't show up in any PLAC).
  const originalResolve = ctx.resolvePlaceFn;
  function normalize(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }
  ctx.resolvePlaceFn = async (db, name) => {
    const cached = placeMap.get(normalize(name));
    if (cached) return cached;
    const created = await originalResolve(db, name);
    placeMap.set(normalize(created.name), created);
    return created;
  };
  console.log(`[import-timing]     phasePrepPlaces: resolved ${names.length} unique places`);
}
