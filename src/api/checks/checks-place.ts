import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import { LAN_LETTER_CODES } from '../place-gazetteers/bundled';
import type { CheckResult, CheckSeverity } from './check-utils';

/**
 * Flat set of valid Swedish länsbokstav letters (one- or two-letter codes
 * like A, AB, B, AC, BD). Derived from LAN_LETTER_CODES so there's a single
 * source of truth.
 */
const LAN_LETTER_SET: Set<string> = new Set(
  Object.values(LAN_LETTER_CODES).flatMap(letters => letters.map(l => l.toUpperCase())),
);

export function checkOrphanedPlace(db: Database): CheckResult[] {
  // Four bulk set-membership queries instead of four correlated NOT EXISTS
  // subqueries (which went O(places × references) on large DBs).
  const places = queryAll<{ id: string; name: string }>(db, 'SELECT id, name FROM places');
  const usedByEvents = new Set(
    queryAll<{ id: string }>(db, 'SELECT DISTINCT place_id AS id FROM events WHERE place_id IS NOT NULL').map(r => r.id),
  );
  const usedByCitations = new Set(
    queryAll<{ id: string }>(db, 'SELECT DISTINCT place_id AS id FROM citations WHERE place_id IS NOT NULL').map(r => r.id),
  );
  const usedByChildPlaces = new Set(
    queryAll<{ id: string }>(db, 'SELECT DISTINCT parent_place_id AS id FROM places WHERE parent_place_id IS NOT NULL').map(r => r.id),
  );
  const usedByMedia = new Set(
    queryAll<{ id: string }>(
      db,
      "SELECT DISTINCT entity_id AS id FROM media_links WHERE entity_type = 'place'",
    ).map(r => r.id),
  );
  const rows = places.filter(
    p =>
      !usedByEvents.has(p.id) &&
      !usedByCitations.has(p.id) &&
      !usedByChildPlaces.has(p.id) &&
      !usedByMedia.has(p.id),
  );
  return rows.map(r => ({
    code: 'ORPHANED_PLACE',
    severity: 'notice' as CheckSeverity,
    message: `Platsen "${r.name}" används inte någonstans`,
    messageParams: { name: r.name },
    personIds: [],
    placeIds: [r.id],
  }));
}

export function checkCircularPlaceHierarchy(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; parent_place_id: string | null; name: string }>(db,
    'SELECT id, parent_place_id, name FROM places'
  );
  const parentOf = new Map<string, string | null>();
  const nameOf = new Map<string, string>();
  for (const r of rows) {
    parentOf.set(r.id, r.parent_place_id);
    nameOf.set(r.id, r.name);
  }

  const results: CheckResult[] = [];
  const cleared = new Set<string>();          // known acyclic
  const reportedCycles = new Set<string>();   // canonical cycle fingerprints

  for (const start of parentOf.keys()) {
    if (cleared.has(start)) continue;
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | null = start;
    while (current) {
      if (cleared.has(current)) break;
      if (onPath.has(current)) {
        // Cycle: slice the path from the revisit point
        const cycleStart = path.indexOf(current);
        const cycleNodes = path.slice(cycleStart);
        const key = [...cycleNodes].sort().join(',');
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          results.push({
            code: 'CIRCULAR_PLACE_HIERARCHY',
            severity: 'error' as CheckSeverity,
            message: `Platshierarkin innehåller en cykel: ${cycleNodes.map(id => nameOf.get(id) ?? id).join(' → ')}`,
            messageParams: { chain: cycleNodes.map(id => nameOf.get(id) ?? id).join(' → ') },
            personIds: [],
            placeIds: cycleNodes,
          });
        }
        break;
      }
      onPath.add(current);
      path.push(current);
      current = parentOf.get(current) ?? null;
    }
    if (!current || cleared.has(current)) {
      for (const id of path) cleared.add(id);
    }
  }

  return results;
}

export function checkPlaceCoordinatesInvalid(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string; latitude: number; longitude: number }>(db, `
    SELECT id, name, latitude, longitude FROM places
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  `);
  const results: CheckResult[] = [];
  for (const r of rows) {
    const outOfRange = r.latitude < -90 || r.latitude > 90 || r.longitude < -180 || r.longitude > 180;
    const nullIsland = r.latitude === 0 && r.longitude === 0;
    if (!outOfRange && !nullIsland) continue;
    const reason = outOfRange ? 'utanför giltigt intervall' : 'null-island (0, 0)';
    results.push({
      code: 'PLACE_COORDINATES_INVALID',
      severity: 'warning' as CheckSeverity,
      message: `Platsen "${r.name}" har ogiltiga koordinater (${r.latitude}, ${r.longitude}) — ${reason}`,
      messageParams: {
        name: r.name,
        lat: r.latitude,
        lon: r.longitude,
        reason,
      },
      personIds: [],
      placeIds: [r.id],
    });
  }
  return results;
}

/**
 * Detects when a date string was entered into the place name field.
 * Matches: 1736, 1736-11, 1736-11-11, 1736 11 11, 1736/11/11, 1736.11.11.
 */
export function checkPlaceNameLooksLikeDate(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string }>(db, 'SELECT id, name FROM places');
  const datePattern = /^\d{4}([-\s/.]\d{1,2}){0,2}$/;
  const results: CheckResult[] = [];
  for (const r of rows) {
    const trimmed = (r.name ?? '').trim();
    if (!trimmed) continue;
    if (!datePattern.test(trimmed)) continue;
    results.push({
      code: 'PLACE_NAME_LOOKS_LIKE_DATE',
      severity: 'error' as CheckSeverity,
      message: `Platsen "${r.name}" ser ut som ett datum — kontrollera att det inte är fel fält`,
      messageParams: { name: r.name },
      personIds: [],
      placeIds: [r.id],
    });
  }
  return results;
}

/**
 * Detects mangled länsbokstav notation where the closing paren got typed
 * as `I` or `|`. E.g. "Borås (PI", "Hed (UI", "Byske (ACI", "Borås (P|".
 *
 * Validates that the captured letter(s) is a real länsbokstav so we don't
 * false-positive on phrases like "(Approximate" that happen to start with
 * a valid prefix.
 *
 * Skips clean cases where the parens close properly — `Stockholm (A)` and
 * `Gotland (I)` should NOT match.
 */
export function checkPlaceNameBrokenLansbokstav(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string }>(db, 'SELECT id, name FROM places');
  // Captures a 1-2 letter länsbokstav after `(`, followed by `I` or `|`
  // and then either end-of-string, comma, or whitespace — but NOT `)`,
  // which would mean the parens already close cleanly. Clean cases like
  // `Stockholm (A)`, `Gotland (I)`, `Byske (AC)` must not match.
  const brokenPattern = /\(([A-ZÅÄÖ]{1,2})([I|])(?=$|[\s,])/;
  const results: CheckResult[] = [];
  for (const r of rows) {
    const name = r.name ?? '';
    if (!name) continue;
    const m = name.match(brokenPattern);
    if (!m) continue;
    const letters = m[1].toUpperCase();
    if (!LAN_LETTER_SET.has(letters)) continue;
    // Build suggested fix: replace `(LETTERS<I|>` with `(LETTERS)`.
    // Use a regex with the literal letters + the broken char captured.
    const literal = `(${m[1]}${m[2]}`;
    const fixed = `(${m[1]})`;
    const suggestion = name.replace(literal, fixed);
    results.push({
      code: 'PLACE_NAME_BROKEN_LANSBOKSTAV',
      severity: 'warning' as CheckSeverity,
      message: `Platsen "${name}" verkar ha trasig länsbokstavnotation — föreslagen rättelse: "${suggestion}"`,
      messageParams: { name, suggestion },
      personIds: [],
      placeIds: [r.id],
    });
  }
  return results;
}

export function checkPlaceDatesInverted(db: Database): CheckResult[] {
  const rows = queryAll<{ id: string; name: string; date_from: string; date_to: string }>(db, `
    SELECT id, name, date_from, date_to FROM places
    WHERE date_from IS NOT NULL AND date_to IS NOT NULL AND date_from > date_to
  `);
  return rows.map(r => ({
    code: 'PLACE_DATES_INVERTED',
    severity: 'error' as CheckSeverity,
    message: `Platsen "${r.name}" har omvänt datumintervall (${r.date_from} → ${r.date_to})`,
    messageParams: { name: r.name, dateFrom: r.date_from, dateTo: r.date_to },
    personIds: [],
    placeIds: [r.id],
  }));
}
