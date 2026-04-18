import * as fs from 'fs';
import * as path from 'path';
import type { Database } from 'node-sqlite3-wasm';
import type { Media } from './types';
import { queryOne, queryAll } from './db';

export interface MediaFileBase64Result {
  base64: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileName: string;
}

export interface UntaggedMediaItem extends Media {
  entity_link_count: number;
  linked_entity_types: string;
}

export interface MediaWithContext extends Media {
  context: string;
  context_entity_type: string;
  context_entity_id: string;
}

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

/**
 * Read a media file from disk and return it as base64.
 * max_dimension is accepted but resizing is not implemented (would require sharp or canvas).
 * Returns null if the media record or file is not found.
 */
export function getMediaFileBase64(
  db: Database,
  mediaId: string,
  _maxDimension?: number,
): MediaFileBase64Result | null {
  const media = queryOne<Media>(db, 'SELECT * FROM media WHERE id = ?', [mediaId]);
  if (!media || !media.file_ref) return null;

  const filePath = media.file_ref;
  if (!fs.existsSync(filePath)) return null;

  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const mimeType = guessMimeType(filePath);
  const fileName = path.basename(filePath);

  return { base64, mimeType, fileName };
}

/**
 * Find media items that have NO media_links with entity_type='person'.
 * Ordered by number of other entity links (most connected first).
 */
export function getUntaggedMedia(db: Database, limit = 20): UntaggedMediaItem[] {
  return queryAll<UntaggedMediaItem>(db, `
    SELECT m.*,
      COUNT(ml.id) AS entity_link_count,
      COALESCE(GROUP_CONCAT(DISTINCT ml.entity_type), '') AS linked_entity_types
    FROM media m
    LEFT JOIN media_links ml ON ml.media_id = m.id
    WHERE m.id NOT IN (
      SELECT DISTINCT ml2.media_id
      FROM media_links ml2
      WHERE ml2.entity_type = 'person'
    )
    GROUP BY m.id
    ORDER BY entity_link_count DESC, m.created_at DESC
    LIMIT ?
  `, [limit]);
}

/**
 * Find media that might contain a specific person based on related entities:
 * - Media linked directly to the person
 * - Media linked to events the person participated in
 * - Media linked to relationships the person is in
 * - Media linked to family members (parents, children, spouses)
 */
export function getMediaForPersonContext(db: Database, personId: string): MediaWithContext[] {
  const results: MediaWithContext[] = [];
  const seen = new Set<string>();

  // 1. Media linked directly to person
  const directMedia = queryAll<Media & { link_id: string }>(db, `
    SELECT m.*, ml.id AS link_id
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id
    WHERE ml.entity_type = 'person' AND ml.entity_id = ?
  `, [personId]);
  for (const m of directMedia) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      results.push({ ...m, context: 'Directly linked to person', context_entity_type: 'person', context_entity_id: personId });
    }
  }

  // 2. Media linked to events the person participated in
  const eventMedia = queryAll<Media & { event_id: string; event_type: string }>(db, `
    SELECT DISTINCT m.*, e.id AS event_id, e.event_type
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id AND ml.entity_type = 'event'
    JOIN events e ON e.id = ml.entity_id
    JOIN event_participants ep ON ep.event_id = e.id
    WHERE ep.person_id = ?
  `, [personId]);
  for (const m of eventMedia) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      results.push({ ...m, context: `Linked to ${m.event_type} event`, context_entity_type: 'event', context_entity_id: m.event_id });
    }
  }

  // 3. Media linked to relationships the person is in
  const relMedia = queryAll<Media & { relationship_id: string; rel_type: string }>(db, `
    SELECT DISTINCT m.*, r.id AS relationship_id, r.type AS rel_type
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id AND ml.entity_type = 'relationship'
    JOIN relationships r ON r.id = ml.entity_id
    WHERE r.person1_id = ? OR r.person2_id = ?
  `, [personId, personId]);
  for (const m of relMedia) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      results.push({ ...m, context: `Linked to ${m.rel_type} relationship`, context_entity_type: 'relationship', context_entity_id: m.relationship_id });
    }
  }

  // 4. Media linked to family members (via parent_child and couple relationships)
  const familyMedia = queryAll<Media & { family_person_id: string; family_given_name: string | null; family_surname: string | null }>(db, `
    SELECT DISTINCT m.*, p.id AS family_person_id, pn.given_name AS family_given_name, pn.surname AS family_surname
    FROM media m
    JOIN media_links ml ON ml.media_id = m.id AND ml.entity_type = 'person'
    JOIN persons p ON p.id = ml.entity_id
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = 0
    WHERE p.id != ? AND p.id IN (
      SELECT CASE WHEN r.person1_id = ? THEN r.person2_id ELSE r.person1_id END
      FROM relationships r
      WHERE (r.person1_id = ? OR r.person2_id = ?)
        AND r.type IN ('parent_child', 'couple')
    )
  `, [personId, personId, personId, personId]);
  for (const m of familyMedia) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      const name = [m.family_given_name, m.family_surname].filter(Boolean).join(' ') || 'family member';
      results.push({ ...m, context: `Linked to ${name}`, context_entity_type: 'person', context_entity_id: m.family_person_id });
    }
  }

  return results;
}

export interface PersonForMatching {
  person_id: string;
  given_name: string | null;
  surname: string | null;
  regions: Array<{ media_id: string; x: number; y: number; width: number; height: number }>;
}

/**
 * Get persons who have existing face region tags, with their region coordinates.
 * Used for face comparison — match new faces against known ones.
 */
export function getPersonsForMatching(db: Database, limit = 50): PersonForMatching[] {
  const rows = queryAll<{
    person_id: string;
    given_name: string | null;
    surname: string | null;
    media_id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>(db, `
    SELECT mr.person_id, pn.given_name, pn.surname,
           mr.media_id, mr.x, mr.y, mr.width, mr.height
    FROM media_regions mr
    JOIN persons p ON p.id = mr.person_id
    LEFT JOIN person_names pn ON pn.person_id = p.id AND pn.sort_order = 0
    WHERE mr.person_id IS NOT NULL
    ORDER BY pn.surname, pn.given_name
  `, []);

  const personMap = new Map<string, PersonForMatching>();
  for (const row of rows) {
    let entry = personMap.get(row.person_id);
    if (!entry) {
      entry = {
        person_id: row.person_id,
        given_name: row.given_name,
        surname: row.surname,
        regions: [],
      };
      personMap.set(row.person_id, entry);
    }
    entry.regions.push({
      media_id: row.media_id,
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
    });
  }

  const result = Array.from(personMap.values());
  return result.slice(0, limit);
}

export interface MediaTaggingStatus {
  totalMedia: number;
  taggedMedia: number;
  untaggedMedia: number;
  totalRegions: number;
}

/**
 * Get an overview of media tagging progress.
 */
export function getMediaTaggingStatus(db: Database): MediaTaggingStatus {
  const totalMedia = queryOne<{ count: number }>(db, 'SELECT COUNT(*) as count FROM media', [])?.count ?? 0;
  const taggedMedia = queryOne<{ count: number }>(db, `
    SELECT COUNT(DISTINCT mr.media_id) as count FROM media_regions mr
  `, [])?.count ?? 0;
  const totalRegions = queryOne<{ count: number }>(db, 'SELECT COUNT(*) as count FROM media_regions', [])?.count ?? 0;

  return {
    totalMedia,
    taggedMedia,
    untaggedMedia: totalMedia - taggedMedia,
    totalRegions,
  };
}
