import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import type { CheckResult, CheckSeverity } from './check-utils';
import { findDuplicates } from '../duplicates';

export function checkPossibleDuplicatePerson(db: Database): CheckResult[] {
  const candidates = findDuplicates(db);
  return candidates.map(c => ({
    code: 'POSSIBLE_DUPLICATE_PERSON',
    severity: 'notice' as CheckSeverity,
    message: `Möjliga dubblettpersoner (poäng ${c.score})`,
    messageParams: { score: c.score, count: 2 },
    personIds: [c.person1_id, c.person2_id],
  }));
}

export function checkDuplicateIdentifier(db: Database): CheckResult[] {
  const rows = queryAll<{ identifier_type: string; identifier_value: string; person_id: string }>(db, `
    SELECT identifier_type, identifier_value, person_id
    FROM person_identifiers
    WHERE (identifier_type, identifier_value) IN (
      SELECT identifier_type, identifier_value
      FROM person_identifiers
      GROUP BY identifier_type, identifier_value
      HAVING COUNT(*) > 1
    )
    ORDER BY identifier_type, identifier_value
  `);
  const groups = new Map<string, { type: string; value: string; personIds: string[] }>();
  for (const r of rows) {
    const key = `${r.identifier_type}:${r.identifier_value}`;
    if (!groups.has(key)) groups.set(key, { type: r.identifier_type, value: r.identifier_value, personIds: [] });
    groups.get(key)!.personIds.push(r.person_id);
  }
  const results: CheckResult[] = [];
  for (const g of groups.values()) {
    results.push({
      code: 'DUPLICATE_IDENTIFIER',
      severity: 'warning' as CheckSeverity,
      message: `${g.personIds.length} personer delar identifierare ${g.type}:${g.value}`,
      messageParams: { count: g.personIds.length, type: g.type, value: g.value },
      personIds: g.personIds,
    });
  }
  return results;
}

export function checkDuplicatePlace(db: Database): CheckResult[] {
  const rows = queryAll<{ normalized_name: string; parent_place_id: string | null; id: string; name: string }>(db, `
    SELECT normalized_name, parent_place_id, id, name
    FROM places
    WHERE (normalized_name, COALESCE(parent_place_id, '')) IN (
      SELECT normalized_name, COALESCE(parent_place_id, '')
      FROM places
      GROUP BY normalized_name, COALESCE(parent_place_id, '')
      HAVING COUNT(*) > 1
    )
    ORDER BY normalized_name
  `);
  const groups = new Map<string, { name: string; placeIds: string[] }>();
  for (const r of rows) {
    const key = `${r.normalized_name}:${r.parent_place_id ?? ''}`;
    if (!groups.has(key)) groups.set(key, { name: r.name, placeIds: [] });
    groups.get(key)!.placeIds.push(r.id);
  }
  const results: CheckResult[] = [];
  for (const g of groups.values()) {
    results.push({
      code: 'DUPLICATE_PLACE',
      severity: 'notice' as CheckSeverity,
      message: `${g.placeIds.length} platser delar namn "${g.name}" under samma förälder`,
      messageParams: { count: g.placeIds.length, name: g.name },
      personIds: [],
      placeIds: g.placeIds,
    });
  }
  return results;
}
