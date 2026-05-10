import type { Database } from 'node-sqlite3-wasm';
import { queryAll } from '../db';
import { findDuplicates } from '../duplicates';
import type { CheckResult, CheckSeverity } from './check-utils';

export function checkPossibleDuplicatePerson(db: Database): CheckResult[] {
  const candidates = findDuplicates(db);
  return candidates.map(c => ({
    code: 'POSSIBLE_DUPLICATE_PERSON',
    severity: 'notice' as CheckSeverity,
    message: `Möjliga dubblettpersoner (poäng ${c.score})`,
    messageParams: { score: c.score, count: 2 },
    personIds: [c.person1_id, c.person2_id],
    landingPath: `/duplicates?tab=persons&pair=${c.person1_id}:${c.person2_id}`,
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
      landingPath: `/duplicates?tab=places&pair=${g.placeIds[0]}:${g.placeIds[1]}`,
    });
  }
  return results;
}

export function checkDuplicateMedia(db: Database): CheckResult[] {
  const rows = queryAll<{ file_ref: string; id: string; title: string | null }>(db, `
    SELECT file_ref, id, title
    FROM media
    WHERE file_ref IS NOT NULL AND file_ref != ''
      AND file_ref IN (
        SELECT file_ref FROM media
        WHERE file_ref IS NOT NULL AND file_ref != ''
        GROUP BY file_ref
        HAVING COUNT(*) > 1
      )
    ORDER BY file_ref
  `);
  const groups = new Map<string, { fileRef: string; mediaIds: string[] }>();
  for (const r of rows) {
    if (!groups.has(r.file_ref)) groups.set(r.file_ref, { fileRef: r.file_ref, mediaIds: [] });
    groups.get(r.file_ref)!.mediaIds.push(r.id);
  }
  const results: CheckResult[] = [];
  for (const g of groups.values()) {
    results.push({
      code: 'DUPLICATE_MEDIA',
      severity: 'notice' as CheckSeverity,
      message: `${g.mediaIds.length} mediafiler delar filväg "${g.fileRef}"`,
      messageParams: { count: g.mediaIds.length, fileRef: g.fileRef },
      personIds: [],
      mediaIds: g.mediaIds,
      landingPath: `/duplicates?tab=media&pair=${g.mediaIds[0]}:${g.mediaIds[1]}`,
    });
  }
  return results;
}

export function checkDuplicateSource(db: Database): CheckResult[] {
  // Pass 1: same URL
  const urlRows = queryAll<{ id: string; url: string }>(db, `
    SELECT id, url FROM sources
    WHERE url IS NOT NULL AND url != ''
      AND url IN (
        SELECT url FROM sources
        WHERE url IS NOT NULL AND url != ''
        GROUP BY url
        HAVING COUNT(*) > 1
      )
    ORDER BY url
  `);
  const urlGroups = new Map<string, string[]>();
  for (const r of urlRows) {
    if (!urlGroups.has(r.url)) urlGroups.set(r.url, []);
    urlGroups.get(r.url)!.push(r.id);
  }

  // Pass 2: same (title, author, publication_info), all non-empty
  const metaRows = queryAll<{ id: string; title: string; author: string; publication_info: string }>(db, `
    SELECT id, title, author, publication_info FROM sources
    WHERE title IS NOT NULL AND title != ''
      AND author IS NOT NULL AND author != ''
      AND publication_info IS NOT NULL AND publication_info != ''
      AND (title, author, publication_info) IN (
        SELECT title, author, publication_info FROM sources
        WHERE title IS NOT NULL AND title != ''
          AND author IS NOT NULL AND author != ''
          AND publication_info IS NOT NULL AND publication_info != ''
        GROUP BY title, author, publication_info
        HAVING COUNT(*) > 1
      )
    ORDER BY title, author, publication_info
  `);
  const metaGroups = new Map<string, string[]>();
  for (const r of metaRows) {
    const key = `${r.title}\u0000${r.author}\u0000${r.publication_info}`;
    if (!metaGroups.has(key)) metaGroups.set(key, []);
    metaGroups.get(key)!.push(r.id);
  }

  // Merge: dedupe by the set of sourceIds so a group that appears in both passes
  // shows up only once.
  const seen = new Set<string>();
  const results: CheckResult[] = [];
  function emit(sourceIds: string[], label: string) {
    const key = [...sourceIds].sort().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      code: 'DUPLICATE_SOURCE',
      severity: 'notice' as CheckSeverity,
      message: `${sourceIds.length} källor matchar ${label}`,
      messageParams: { count: sourceIds.length, label },
      personIds: [],
      sourceIds,
      landingPath: `/duplicates?tab=sources&pair=${sourceIds[0]}:${sourceIds[1]}`,
    });
  }
  for (const ids of urlGroups.values()) emit(ids, 'samma URL');
  for (const ids of metaGroups.values()) emit(ids, 'samma titel, författare och utgivning');
  return results;
}
