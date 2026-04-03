import type { Database } from 'node-sqlite3-wasm';
import type { Place } from '../api/types';
import { createPlace, findOrCreatePlace } from '../api/places';

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Finds or creates a place with a specific parent.
 * Differs from findOrCreatePlace in that it matches on (normalized_name, parent_place_id)
 * to avoid collapsing e.g. two parishes named "Kungsbacka" in different counties.
 */
function findOrCreateWithParent(db: Database, name: string, parentId: string | null): Place {
  const norm = normalize(name);
  const existing = (
    parentId === null
      ? db.prepare('SELECT * FROM places WHERE normalized_name = ? AND parent_place_id IS NULL LIMIT 1').get([norm])
      : db.prepare('SELECT * FROM places WHERE normalized_name = ? AND parent_place_id = ? LIMIT 1').get([norm, parentId])
  ) as Place | undefined;
  if (existing) return existing;
  return createPlace(db, { name: name.trim(), parent_place_id: parentId });
}

/**
 * Parses a Genney 4.1 Swedish hierarchical place string and creates a chain of
 * Place records linked by parent_place_id, returning the innermost (most specific) place.
 *
 * Example:
 *   "Fässberg, Mölndals landsförsamling, Göteborgs och Bohus, Sverige"
 *   → Fässberg (parent: Mölndals) → Mölndals (parent: GoBohus) → GoBohus (parent: Sverige) → Sverige
 *
 * Single-part strings fall back to the flat findOrCreatePlace behaviour.
 */
export function findOrCreateSwedishPlace(db: Database, placeTag: string): Place {
  const parts = placeTag.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return findOrCreatePlace(db, placeTag.trim());

  // Build outer → inner: process right-to-left, chaining parent_place_id
  let parentId: string | null = null;
  let innermost: Place | null = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const place = findOrCreateWithParent(db, parts[i], parentId);
    parentId = place.id;
    if (i === 0) innermost = place;
  }
  return innermost!;
}
