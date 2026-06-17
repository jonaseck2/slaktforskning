// Regression tripwire for the GEDCOM export IPC-round-trip stall.
//
// The incident: a GEDCOM export of a 22 243-person tree did not complete
// within ~3 minutes at ~0% CPU. Root cause: the per-concept emitters
// (emitNotesForEntity, emitPersonAssociations, emitNameTranslations,
// emitPlaceTranslations) each issue a per-entity DB query, and they are
// called INSIDE the person / event / name / place loops in
// src/gedcom/exporter.ts. On a large tree that is ~150k individual
// `await get*(db, id)` calls — under the Tauri db-shim each is one IPC
// round-trip (~1 ms), so the CPU sits idle while the renderer blocks for
// minutes. See .claude/rules/performance.md.
//
// This test locks in the invariant the user actually cares about: export
// query count must be O(number-of-tables), NOT O(persons + events + names +
// places). Wall-clock is deliberately NOT the assertion (flaky in CI); the
// COUNT of DB queries is a deterministic proxy for IPC round-trips.
//
// The count is taken by spying on `db.prepare` — the single primitive every
// queryAll / queryOne / runSql funnels through (src/api/db.ts). Every emitter,
// every api getter, every bulk fetch ends up calling db.prepare exactly once
// per SQL statement, so the spy's call count is the total query count for the
// export, regardless of which code path issued each query.
//
// EXPECTED STATE: this test FAILS (red) until the prefetch fix lands. With the
// per-entity emitters still in the loops, the count scales with the seed size
// and runs to tens of thousands — far above the O(tables) budget. Once the
// four emitters receive prefetched data instead of fetching per entity, the
// count drops to the small constant a correct prefetch issues and the test
// goes green.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Database } from 'node-sqlite3-wasm';
import { createTestDb } from './helpers';
import { runSql } from '../../src/api/db';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createPlace } from '../../src/api/places';
import { createEvent } from '../../src/api/events';
import { createRelationship, addEventParticipant } from '../../src/api/relationships';
import { createNote, linkNoteToEntity } from '../../src/api/notes';
import { exportGedcom } from '../../src/gedcom/exporter';

// Seed size. 5 000 persons is large enough that any per-entity query path
// blows the budget by orders of magnitude, while still seeding in a few
// seconds inside a single transaction.
const PERSON_COUNT = 5000;

// Query-count budget. A correct export does a fixed number of bulk fetches:
// prefetchExportData issues ~16 table-level queries; the exporter adds
// listSources, listPlaces (via the prefetch), a handful of db_settings reads
// (header_metadata, researcher_*, default_person_id), the SNOTE shared-note
// disclosure pass, and a small constant of other lookups. All of those are
// O(tables), not O(rows). 200 gives generous headroom over that constant
// (~30-40 today) so the test only trips when a query path starts scaling with
// entity count — which is exactly the regression we are guarding against.
const QUERY_BUDGET = 200;

describe('GEDCOM export query-count budget on a large tree', () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDb();

    // Seed inside one transaction — per-row autocommit would make 5 000
    // persons take far too long even in-memory.
    await runSql(db, 'BEGIN IMMEDIATE');
    try {
      // A handful of shared places attached to events — exercises the
      // emitPlaceTranslations per-place path in the event loop.
      const placeIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const place = await createPlace(db, { name: `Place ${i}` });
        placeIds.push(place.id);
      }

      let prevPersonId: string | null = null;
      for (let i = 0; i < PERSON_COUNT; i++) {
        const person = await createPerson(db, {
          sex: i % 2 === 0 ? 'M' : 'F',
          given_name: `Given${i}`,
          surname: `Surname${i}`,
        });

        // A second name → exercises the per-name emitNameTranslations path.
        await addPersonName(db, person.id, {
          given_name: `Alias${i}`,
          surname: `Surname${i}`,
          name_type: 'alias',
        });

        // One birth event with a place → per-event emitNotesForEntity +
        // emitPlaceTranslations paths.
        const ev = await createEvent(db, {
          event_type: 'birth',
          date_type: 'exact',
          date_value: `1${800 + (i % 200)}-01-01`,
          place_id: placeIds[i % placeIds.length],
        });
        await addEventParticipant(db, { event_id: ev.id, person_id: person.id, role: 'primary' });

        // A note linked to the person → per-person emitNotesForEntity path.
        const note = await createNote(db, { text: `Note for person ${i}` });
        await linkNoteToEntity(db, note.id, 'person', person.id);

        // Chain a couple relationship to the previous person so the
        // relationship loop has work too.
        if (prevPersonId) {
          await createRelationship(db, {
            type: 'couple',
            person1_id: prevPersonId,
            person2_id: person.id,
          });
        }
        prevPersonId = person.id;
      }
      await runSql(db, 'COMMIT');
    } catch (err) {
      try { await runSql(db, 'ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }, 120_000);

  it('issues a number of queries bounded by table count, not by entity count', async () => {
    // Sanity-check the seed actually landed — if this is 0 the test below
    // would pass for the wrong reason (no work to do).
    const stmt = db.prepare('SELECT COUNT(*) AS c FROM persons');
    const seeded = (await stmt.get([]) as { c: number }).c;
    (stmt as unknown as { finalize(): void }).finalize();
    expect(seeded).toBe(PERSON_COUNT);

    // Spy on the single query primitive. Every queryAll / queryOne / runSql
    // and every db.prepare(...).run/get/all in the export path goes through
    // this, so the call count IS the total query count for the export.
    const prepareSpy = vi.spyOn(db, 'prepare');

    const { ged } = await exportGedcom(db, '5.5.1');

    const queryCount = prepareSpy.mock.calls.length;
    prepareSpy.mockRestore();

    // Export must have produced real output (guards against an early throw
    // making the count trivially small).
    expect(ged).toContain('0 HEAD');
    expect(ged.length).toBeGreaterThan(1000);

    // The assertion. RED today: with per-entity emitters in the loops the
    // count is in the tens of thousands (scales with PERSON_COUNT). GREEN
    // once the emitters receive prefetched data.
    expect(queryCount).toBeLessThan(QUERY_BUDGET);
  }, 300_000);
});
