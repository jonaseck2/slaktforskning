/**
 * T25 — Genney importer Phase 2 concept mapping.
 *
 * Pins the new T25 behaviour: SOURCE.NOTE content lands in the shared
 * `notes` table (T04) + a `note_links` row pointing at the source, instead
 * of being silently dropped. Also confirms what's NOT mapped (REMARK stays
 * as person notes; no person_associations / negative assertions / name
 * translations / source coverage in Genney source data).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { transformGenney } from '../../src/import/genney/transform';
import type { GenneyTables } from '../../src/import/genney/transform';
import { listNotes, getNotesForEntity } from '../../src/api/notes';
import { listSources } from '../../src/api/sources';
import { createTestDb } from './helpers';

function emptyTables(): GenneyTables {
  return {
    PERSON: [], FAMILY: [], COUPLE_FAMILY: [], SPOUSE_FAMILY: [],
    EVENT: [], EVENT_PLACE: [], OWNER_EVENT: [], SPLACE: [], SOURCE: [],
    CITATION: [], CITATION_SOURCE: [], OWNER_CITATION: [], REMARK: [],
    REPO: [], SOURCE_REPO: [], GROUPS: [], GROUP_MEMBER: [],
    MEDIA: [], OWNER_MEDIA: [], TODO: [],
    SUBMITTER: [], ADDRESS: [], INI: [],
  };
}

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('T25 Genney importer — SOURCE.NOTE → shared notes', async () => {
  it('routes a SOURCE.NOTE row into the notes + note_links tables', async () => {
    const tables = emptyTables();
    tables.SOURCE = [
      { RID: 'S1', TITLE: 'Kyrkboken Råda 1850', NOTE: 'Coverage: Råda parish 1850-1900.' },
      { RID: 'S2', TITLE: 'Untouched source', NOTE: null },
    ];
    const summary = await transformGenney(db, tables);
    expect(summary.sources).toBe(2);

    const sources = await listSources(db);
    const s1 = sources.find(s => s.title === 'Kyrkboken Råda 1850');
    expect(s1).toBeDefined();

    // The NOTE landed in the shared `notes` table, linked to the source.
    const notes = await listNotes(db);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some(n => n.text.includes('Coverage: Råda parish'))).toBe(true);

    const linkedNotes = await getNotesForEntity(db, 'source', s1!.id);
    expect(linkedNotes).toHaveLength(1);
    expect(linkedNotes[0].text).toContain('Coverage: Råda parish');

    // The warning message announces the new T25 behaviour.
    expect(summary.warnings.some(w => w.includes('imported as shared notes'))).toBe(true);
  });

  it('does not create a note when SOURCE.NOTE is empty/whitespace', async () => {
    const tables = emptyTables();
    tables.SOURCE = [
      { RID: 'S1', TITLE: 'X', NOTE: '' },
      { RID: 'S2', TITLE: 'Y', NOTE: '   ' },
      { RID: 'S3', TITLE: 'Z', NOTE: null },
    ];
    await transformGenney(db, tables);
    const notes = await listNotes(db);
    expect(notes).toHaveLength(0);
  });
});
