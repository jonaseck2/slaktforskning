// `.claude/rules/api.md` states the contract for bulk variants: return the
// assigned ids, and accept a caller-supplied one. `bulkCreateCitations` was the
// only bulk function in src/api/ that did neither, which is why the importer
// could not attach anything to a citation row it had just inserted.
//
// See docs/plans/2026-08-23-ad-citation-aid.md Task 1.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bulkCreateCitations, createSource, getCitation } from '../../src/api/sources';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('bulkCreateCitations id contract', () => {
  it('returns one id per row, in input order', async () => {
    const src = await createSource(db, { title: 'S' });
    const ids = await bulkCreateCitations(db, [
      { source_id: src.id, page: 'one' },
      { source_id: src.id, page: 'two' },
      { source_id: src.id, page: 'three' },
    ]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    const pages = await Promise.all(ids.map(async id => (await getCitation(db, id))?.page));
    expect(pages).toEqual(['one', 'two', 'three']);
  });

  it('uses a caller-supplied id verbatim', async () => {
    const src = await createSource(db, { title: 'S' });
    const mine = crypto.randomUUID();
    const ids = await bulkCreateCitations(db, [{ id: mine, source_id: src.id, page: 'p' }]);
    expect(ids).toEqual([mine]);
    expect((await getCitation(db, mine))?.page).toBe('p');
  });

  it('mixes supplied and generated ids in one call', async () => {
    const src = await createSource(db, { title: 'S' });
    const mine = crypto.randomUUID();
    const ids = await bulkCreateCitations(db, [
      { source_id: src.id, page: 'gen' },
      { id: mine, source_id: src.id, page: 'mine' },
    ]);
    expect(ids[1]).toBe(mine);
    expect(ids[0]).not.toBe(mine);
    expect((await queryAll(db, 'SELECT id FROM citations')).length).toBe(2);
  });

  it('returns an empty array for empty input, without touching the DB', async () => {
    expect(await bulkCreateCitations(db, [])).toEqual([]);
  });

  it('still inserts in one batch, not per row', async () => {
    const src = await createSource(db, { title: 'S' });
    const rows = Array.from({ length: 500 }, (_, i) => ({ source_id: src.id, page: `p${i}` }));
    // Guard against a regression to a per-row loop: 500 rows must not cost 500
    // statement preparations. Same spy tests/unit/export-perf.test.ts uses —
    // `db.prepare` is the single primitive every query goes through.
    const prepareSpy = vi.spyOn(db, 'prepare');
    await bulkCreateCitations(db, rows);
    const queryCount = prepareSpy.mock.calls.length;
    prepareSpy.mockRestore();
    expect((await queryAll(db, 'SELECT id FROM citations')).length).toBe(500);
    expect(queryCount).toBeLessThan(20);
  });
});
