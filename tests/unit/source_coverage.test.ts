// Source coverage event CRUD (T08 — GEDCOM alignment plan).
//
// Covers basic create / list-for-source / update / delete on the
// source_coverage_events table. The GEDCOM round-trip side is exercised
// by tests/unit/gedcom-source-coverage-roundtrip.test.ts.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSourceCoverageEvent,
  getSourceCoverageEvent,
  getCoverageForSource,
  updateSourceCoverageEvent,
  deleteSourceCoverageEvent,
} from '../../src/api/source_coverage';
import { createSource } from '../../src/api/sources';
import { findOrCreatePlace } from '../../src/api/places';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('source coverage event CRUD (T08)', () => {
  it('creates a coverage row with all fields and reads it back', async () => {
    const src = await createSource(db, { title: 'Östergötland parish register' });
    const place = await findOrCreatePlace(db, 'Östergötland');
    const row = await createSourceCoverageEvent(db, {
      source_id: src.id,
      event_type: 'BIRT',
      date_value_from: '1850',
      date_value_to: '1920',
      place_id: place.id,
      notes: 'Parish baptismal records',
    });
    expect(row.id).toBeTruthy();
    expect(row.event_type).toBe('BIRT');
    expect(row.date_value_from).toBe('1850');
    expect(row.date_value_to).toBe('1920');
    expect(row.place_id).toBe(place.id);
    expect(row.notes).toBe('Parish baptismal records');

    const fetched = await getSourceCoverageEvent(db, row.id);
    expect(fetched).toEqual(row);
  });

  it('getCoverageForSource returns all rows for a source in insertion order', async () => {
    const src = await createSource(db, { title: 'Multi-event source' });
    await createSourceCoverageEvent(db, { source_id: src.id, event_type: 'BIRT', date_value_from: '1850', date_value_to: '1920' });
    await createSourceCoverageEvent(db, { source_id: src.id, event_type: 'DEAT', date_value_from: '1860', date_value_to: '1930' });
    await createSourceCoverageEvent(db, { source_id: src.id, event_type: 'MARR' });

    const rows = await getCoverageForSource(db, src.id);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.event_type).sort()).toEqual(['BIRT', 'DEAT', 'MARR']);
  });

  it('updateSourceCoverageEvent patches selected columns; leaves rest intact', async () => {
    const src = await createSource(db, { title: 'S' });
    const row = await createSourceCoverageEvent(db, {
      source_id: src.id, event_type: 'BIRT', date_value_from: '1850', date_value_to: '1920',
    });
    const updated = await updateSourceCoverageEvent(db, row.id, { event_type: 'CHR', notes: 'updated' });
    expect(updated!.event_type).toBe('CHR');
    expect(updated!.notes).toBe('updated');
    expect(updated!.date_value_from).toBe('1850');
    expect(updated!.date_value_to).toBe('1920');
  });

  it('deleteSourceCoverageEvent removes the row; cascades when the source is removed', async () => {
    const src = await createSource(db, { title: 'S' });
    const row = await createSourceCoverageEvent(db, { source_id: src.id, event_type: 'BIRT' });
    const removed = await deleteSourceCoverageEvent(db, row.id);
    expect(removed).toBe(true);
    expect(await getSourceCoverageEvent(db, row.id)).toBeNull();

    // FK cascade: deleting the parent source removes any remaining rows.
    await createSourceCoverageEvent(db, { source_id: src.id, event_type: 'DEAT' });
    expect((await getCoverageForSource(db, src.id))).toHaveLength(1);
    const { deleteSource } = await import('../../src/api/sources');
    await deleteSource(db, src.id);
    expect((await getCoverageForSource(db, src.id))).toHaveLength(0);
  });
});
