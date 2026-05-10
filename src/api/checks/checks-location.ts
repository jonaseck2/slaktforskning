import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import { resolvePlace } from '../place-gazetteers/resolver';
import type { Gazetteer, GazetteerNode } from '../place-gazetteers/types';
import type { CheckResult, CheckSeverity } from './check-utils';
import { haversineKm } from './check-utils';

/**
 * Returns a function that yields to the event loop when more than
 * `budgetMs` of wall-clock time has elapsed since the last yield. Use one
 * instance per loop so each loop gets its own timer.
 */
function makeYieldBudget(budgetMs = 75): () => Promise<void> {
  let last = Date.now();
  return async () => {
    if (Date.now() - last >= budgetMs) {
      await new Promise<void>(resolve => setImmediate(resolve));
      last = Date.now();
    }
  };
}

export async function checkSimultaneousDistantLocations(db: Database): Promise<CheckResult[]> {
  // Find events for same person on same exact date with place lat/lon
  const rows = await queryAll<{
    person_id: string;
    event1_id: string;
    date_value: string;
    lat1: number;
    lon1: number;
    event2_id: string;
    lat2: number;
    lon2: number;
  }>(db, `
    SELECT ep1.person_id,
           e1.id AS event1_id, e1.date_value,
           p1.latitude AS lat1, p1.longitude AS lon1,
           e2.id AS event2_id,
           p2.latitude AS lat2, p2.longitude AS lon2
    FROM event_participants ep1
    JOIN events e1 ON e1.id = ep1.event_id
      AND e1.date_type = 'exact' AND e1.date_value IS NOT NULL
      AND e1.place_id IS NOT NULL
    JOIN places p1 ON p1.id = e1.place_id
      AND p1.latitude IS NOT NULL AND p1.longitude IS NOT NULL
    JOIN event_participants ep2 ON ep2.person_id = ep1.person_id AND ep2.event_id > ep1.event_id
    JOIN events e2 ON e2.id = ep2.event_id
      AND e2.date_type = 'exact' AND e2.date_value = e1.date_value
      AND e2.place_id IS NOT NULL
    JOIN places p2 ON p2.id = e2.place_id
      AND p2.latitude IS NOT NULL AND p2.longitude IS NOT NULL
  `);

  const results: CheckResult[] = [];

  for (const r of rows) {
    const km = haversineKm(r.lat1, r.lon1, r.lat2, r.lon2);
    if (km > 500) {
      results.push({
        code: 'SIMULTANEOUS_DISTANT_LOCATIONS',
        severity: 'warning',
        message: `Två händelser på samma datum (${r.date_value}) är ${Math.round(km)} km från varandra`,
        messageParams: { date: r.date_value, km: Math.round(km) },
        personIds: [r.person_id],
        eventIds: [r.event1_id, r.event2_id],
      });
    }
  }

  return results;
}

export async function checkGazetteerMatchQuality(db: Database, gazetteers: Gazetteer[]): Promise<CheckResult[]> {
  if (gazetteers.length === 0) return [];

  // Places used in events that have no manual coordinates
  const places = await queryAll<{ id: string; name: string }>(db, `
    SELECT DISTINCT p.id, p.name
    FROM places p
    JOIN events e ON e.place_id = p.id
    WHERE p.latitude IS NULL OR p.longitude IS NULL
  `);

  if (places.length === 0) return [];

  // Only check places that are actually referenced by at least one event
  // (an unused place with a dubious name isn't worth flagging).
  const placeIds = places.map(p => p.id);
  const placeholders = placeIds.map(() => '?').join(',');
  const usedRows = await queryAll<{ place_id: string }>(db, `
    SELECT DISTINCT e.place_id
    FROM events e
    WHERE e.place_id IN (${placeholders})
  `, placeIds);
  const placesInUse = new Set(usedRows.map(r => r.place_id));

  // Bulk-load all place hierarchy data for path building (avoids N+1 getPlacePath)
  const allPlaceRows = await queryAll<{ id: string; name: string; parent_place_id: string | null }>(db,
    'SELECT id, name, parent_place_id FROM places'
  );
  const placeMap = new Map(allPlaceRows.map(r => [r.id, r]));
  function buildPlacePath(id: string): string {
    const parts: string[] = [];
    let currentId: string | null = id;
    while (currentId) {
      const row = placeMap.get(currentId);
      if (!row) break;
      parts.push(row.name);
      currentId = row.parent_place_id;
    }
    return parts.join(', ');
  }

  const results: CheckResult[] = [];
  // Cache resolutions by name to avoid re-resolving duplicates
  const cache = new Map<string, ReturnType<typeof resolvePlace>>();

  const yieldIfNeeded = makeYieldBudget();
  for (const place of places) {
    if (!placesInUse.has(place.id)) continue;
    await yieldIfNeeded();

    // Build full place path from in-memory map
    const fullPath = buildPlacePath(place.id);

    // Resolve with caching
    if (!cache.has(fullPath)) {
      cache.set(fullPath, resolvePlace(fullPath, gazetteers));
    }
    const resolved = cache.get(fullPath)!;

    if (!resolved) {
      results.push({
        code: 'PLACE_MATCH_NONE',
        severity: 'notice',
        message: `Platsen "${place.name}" kunde inte matchas mot något ortregister`,
        messageParams: { placeName: place.name },
        personIds: [],
        placeIds: [place.id],
      });
      continue;
    }

    const deepestNode = resolved.matchedNode;
    const isLeaf = !deepestNode.children || deepestNode.children.length === 0;
    const components = place.name.split(',').map(p => p.trim()).filter(Boolean);
    // Wrong-level: single-word input matched a deep leaf — likely a country/region
    // name that happened to match a village with the same name
    const isWrongLevel = components.length === 1 && isLeaf && resolved.matchDepth > 2;

    if (isWrongLevel) {
      results.push({
        code: 'PLACE_MATCH_WRONG_LEVEL',
        severity: 'warning',
        message: `Platsen "${place.name}" verkar matcha en specifik ort (${resolved.matchedPath.join(', ')}) snarare än det angivna området`,
        messageParams: { placeName: place.name, matchedPath: resolved.matchedPath.join(', ') },
        personIds: [],
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(', '),
      });
    } else if (resolved.matchQuality === 'ambiguous') {
      results.push({
        code: 'PLACE_MATCH_AMBIGUOUS',
        severity: 'warning',
        message: `Platsen "${place.name}" är tvetydig — flera möjliga platser hittades`,
        messageParams: { placeName: place.name },
        personIds: [],
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(', '),
      });
    } else if (resolved.matchQuality === 'partial') {
      results.push({
        code: 'PLACE_MATCH_PARTIAL',
        severity: 'notice',
        message: `Platsen "${place.name}" matchades delvis (ej matchade delar: ${resolved.unmatchedComponents.join(', ')})`,
        messageParams: { placeName: place.name, unmatched: resolved.unmatchedComponents.join(', ') },
        personIds: [],
        placeIds: [place.id],
        resolvedLat: resolved.lat,
        resolvedLon: resolved.lon,
        matchedPath: resolved.matchedPath.join(', '),
      });
    }
    // matchQuality === 'exact' → no result
  }

  return results;
}

/**
 * Build a name → minimum-depth map across all gazetteers, using the same
 * universal-normalized keys (lowercase + trim + strip parens) the resolver
 * uses so lookups are consistent across data sources. Depth 1 = root
 * (country), 2 = admin1 (län/state), 3+ = locality.
 */
function buildNameDepthIndex(gazetteers: Gazetteer[]): Map<string, number> {
  const map = new Map<string, number>();
  function normalize(s: string): string {
    return s.toLowerCase().replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function walk(node: GazetteerNode, depth: number) {
    const keys = [normalize(node.name)];
    if (node.aliases) for (const a of node.aliases) keys.push(normalize(a));
    for (const k of keys) {
      if (!k) continue;
      const existing = map.get(k);
      if (existing === undefined || depth < existing) map.set(k, depth);
    }
    if (node.children) for (const c of node.children) walk(c, depth + 1);
  }
  for (const gaz of gazetteers) walk(gaz.root, 1);
  return map;
}

/**
 * For one unmatched component, find the longest greedy token-runs that
 * each match a known gazetteer name. Returns the list of recognized
 * spans (each a `{ start, end, name, depth }`) covering disjoint token
 * windows from left to right. Empty if nothing recognized.
 */
function findRecognizedSpans(
  component: string,
  nameDepth: Map<string, number>,
): Array<{ start: number; end: number; name: string; depth: number }> {
  const tokens = component.split(/\s+/).filter(Boolean);
  const spans: Array<{ start: number; end: number; name: string; depth: number }> = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    // Greedy longest-match starting at i.
    for (let len = tokens.length - i; len >= 1; len--) {
      const window = tokens.slice(i, i + len).join(' ').toLowerCase();
      // Skip very short windows (≤ 2 chars) — they're admin abbreviations
      // (`kn`, `sn`, länsbokstav `A`/`AB`) or ISO country codes (`KN` =
      // Saint Kitts and Nevis, `SN` = Senegal). They aren't a "second name"
      // jammed onto another — the resolver already handles them via alias
      // matching. Treating them as a recognized span produces noisy false
      // positives like flagging `Österåkers kn` as missing-comma.
      if (window.length <= 2) continue;
      const depth = nameDepth.get(window);
      if (depth !== undefined) {
        spans.push({ start: i, end: i + len, name: tokens.slice(i, i + len).join(' '), depth });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return spans;
}

/**
 * Detects places where two or more known place names are jammed into a
 * single comma-component without a comma between them. Classic case:
 * `Richmond Kalifornien USA` (should be `Richmond, Kalifornien, USA`).
 *
 * Scans every comma-component of every place's stored name, whitespace-
 * tokenizes it, and runs a greedy longest-match against the gazetteer
 * name index. If the component decomposes into 2+ adjacent recognized
 * names — and at least one of them is at depth ≤2 (country / admin1) —
 * the place is flagged.
 *
 * The depth-≤2 floor avoids false positives on legitimate multi-word
 * leaf names like `Saint Mary's Parish` or `New York City`, where both
 * tokens may appear deep in some gazetteer but neither functions as a
 * strong geographic anchor.
 */
export async function checkPlaceMissingComma(
  db: Database,
  gazetteers: Gazetteer[],
): Promise<CheckResult[]> {
  if (gazetteers.length === 0) return [];

  // Same scope as checkGazetteerMatchQuality: places referenced by ≥1
  // event with no manual coordinates.
  const places = await queryAll<{ id: string; name: string }>(db, `
    SELECT DISTINCT p.id, p.name
    FROM places p
    JOIN events e ON e.place_id = p.id
    WHERE p.latitude IS NULL OR p.longitude IS NULL
  `);
  if (places.length === 0) return [];

  const nameDepth = buildNameDepthIndex(gazetteers);
  const results: CheckResult[] = [];

  const yieldIfNeeded = makeYieldBudget();
  for (const place of places) {
    await yieldIfNeeded();
    const components = (place.name ?? '').split(',').map(s => s.trim()).filter(Boolean);
    let suggestionForPlace: string | null = null;

    for (let ci = 0; ci < components.length; ci++) {
      const component = components[ci];
      const tokens = component.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) continue;

      const spans = findRecognizedSpans(component, nameDepth);
      if (spans.length < 2) continue;

      // Only flag when at least one recognized name is at depth ≤2.
      const hasShallow = spans.some(s => s.depth <= 2);
      if (!hasShallow) continue;

      // Build suggested split for this component.
      const parts: string[] = [];
      let cursor = 0;
      for (const span of spans) {
        if (span.start > cursor) {
          parts.push(tokens.slice(cursor, span.start).join(' '));
        }
        parts.push(tokens.slice(span.start, span.end).join(' '));
        cursor = span.end;
      }
      if (cursor < tokens.length) parts.push(tokens.slice(cursor).join(' '));

      // Splice the split component back into the rest of the comma-path.
      const replacedComponents = [
        ...components.slice(0, ci),
        ...parts,
        ...components.slice(ci + 1),
      ];
      suggestionForPlace = replacedComponents.join(', ');
      break;
    }

    if (suggestionForPlace !== null) {
      results.push({
        code: 'PLACE_MISSING_COMMA',
        severity: 'warning' as CheckSeverity,
        message: `Platsen "${place.name}" verkar saknas komma — föreslagen rättelse: "${suggestionForPlace}"`,
        messageParams: { name: place.name, suggestion: suggestionForPlace },
        personIds: [],
        placeIds: [place.id],
      });
    }
  }

  return results;
}

/**
 * Detects single bare unmatched components with no parent place — typos,
 * addresses, occupations, hyperlocal names without geographic context.
 *
 * Place must be referenced by ≥1 event, `parent_place_id IS NULL`, and
 * `resolvePlace(name, gazetteers)` must return null. The single-component
 * constraint is implicit (no parent + bare name).
 */
export async function checkPlaceNameNoRegion(
  db: Database,
  gazetteers: Gazetteer[],
): Promise<CheckResult[]> {
  if (gazetteers.length === 0) return [];

  const places = await queryAll<{ id: string; name: string }>(db, `
    SELECT DISTINCT p.id, p.name
    FROM places p
    JOIN events e ON e.place_id = p.id
    WHERE p.parent_place_id IS NULL
      AND (p.latitude IS NULL OR p.longitude IS NULL)
  `);
  if (places.length === 0) return [];

  const results: CheckResult[] = [];
  const cache = new Map<string, ReturnType<typeof resolvePlace>>();
  const yieldIfNeeded = makeYieldBudget();
  for (const place of places) {
    const name = (place.name ?? '').trim();
    if (!name) continue;
    await yieldIfNeeded();
    if (!cache.has(name)) cache.set(name, resolvePlace(name, gazetteers));
    if (cache.get(name) !== null) continue;
    results.push({
      code: 'PLACE_NAME_NO_REGION',
      severity: 'notice' as CheckSeverity,
      message: `Platsen "${name}" kunde inte placeras geografiskt — kontrollera stavning eller lägg till en överordnad plats`,
      messageParams: { name },
      personIds: [],
      placeIds: [place.id],
    });
  }
  return results;
}
