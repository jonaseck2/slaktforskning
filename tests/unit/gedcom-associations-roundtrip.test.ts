// GEDCOM person-to-person associations round-trip (T05 — GEDCOM alignment
// plan).
//
// User goal (verbatim): every authored field in our database survives a
// GEDCOM 5.5.1 OR 7.0 round-trip cleanly. No silent data loss.
//
// T05 specifically: standalone person_associations rows (godparent /
// friend / colleague / enemy / neighbor / other — no event mediation)
// round-trip losslessly on BOTH 5.5.1 (`2 RELA <role>`) and 7.0
// (`2 ROLE <role>`).
//
// Distinct from the existing event-mediated ASSO handling (where ASSO
// nested under a BIRT/CHR carries a witness/godparent role on that
// event) — that path remains unchanged and is exercised by other tests.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createPerson, listPersons } from '../../src/api/persons';
import {
  createPersonAssociation,
  getAssociationsForPerson,
} from '../../src/api/person_associations';
import type { PersonAssociationRole } from '../../src/api/types';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

const ALL_ROLES: PersonAssociationRole[] = [
  'godparent',
  'friend',
  'colleague',
  'enemy',
  'neighbor',
  'other',
];

async function roundTrip(
  version: '5.5.1' | '7.0',
  role: PersonAssociationRole,
  notes: string,
): Promise<{
  ged: string;
  reimportedAssocs: Array<{ role: string; notes: string; from_given: string; to_given: string }>;
}> {
  const p1 = await createPerson(db, { sex: 'M', given_name: 'Alice', surname: 'A' });
  const p2 = await createPerson(db, { sex: 'F', given_name: 'Bob', surname: 'B' });
  await createPersonAssociation(db, {
    person_id: p1.id,
    related_person_id: p2.id,
    role,
    notes,
  });

  const { ged } = await exportGedcom(db, version);

  const db2 = await createTestDb();
  const tree = parseGedcom(ged);
  await importGedcom(db2, tree);

  // Find Alice in the new DB
  const reimportedPersons = await listPersons(db2);
  const alice = reimportedPersons.find((pp) => /Alice/.test(`${pp.given_name ?? ''}`));
  const bob = reimportedPersons.find((pp) => /Bob/.test(`${pp.given_name ?? ''}`));
  expect(alice).toBeDefined();
  expect(bob).toBeDefined();

  const assocs = await getAssociationsForPerson(db2, alice!.id);
  const reimportedAssocs = assocs.map((a) => ({
    role: a.role,
    notes: a.notes,
    from_given: alice!.given_name ?? '',
    to_given: a.related_person_id === bob!.id ? (bob!.given_name ?? '') : '???',
  }));
  return { ged, reimportedAssocs };
}

describe('GEDCOM associations round-trip (T05)', () => {
  it('5.5.1 emits 1 ASSO @Ix@ / 2 RELA <role>', async () => {
    const { ged } = await roundTrip('5.5.1', 'godparent', '');
    expect(ged).toMatch(/1 ASSO @I\d+@/);
    expect(ged).toMatch(/2 RELA godparent/);
  });

  it('7.0 emits 1 ASSO @Ix@ / 2 ROLE <role>', async () => {
    const { ged } = await roundTrip('7.0', 'godparent', '');
    expect(ged).toMatch(/1 ASSO @I\d+@/);
    expect(ged).toMatch(/2 ROLE godparent/);
    expect(ged).not.toMatch(/2 RELA godparent/);
  });

  for (const role of ALL_ROLES) {
    it(`5.5.1: '${role}' round-trips losslessly`, async () => {
      const { reimportedAssocs } = await roundTrip('5.5.1', role, `note about ${role}`);
      expect(reimportedAssocs).toHaveLength(1);
      expect(reimportedAssocs[0].role).toBe(role);
      expect(reimportedAssocs[0].notes).toBe(`note about ${role}`);
      // Bidirectional check: from/to both preserved correctly.
      expect(reimportedAssocs[0].from_given).toBe('Alice');
      expect(reimportedAssocs[0].to_given).toBe('Bob');
    });

    it(`7.0: '${role}' round-trips losslessly`, async () => {
      const { reimportedAssocs } = await roundTrip('7.0', role, `note about ${role}`);
      expect(reimportedAssocs).toHaveLength(1);
      expect(reimportedAssocs[0].role).toBe(role);
      expect(reimportedAssocs[0].notes).toBe(`note about ${role}`);
      expect(reimportedAssocs[0].from_given).toBe('Alice');
      expect(reimportedAssocs[0].to_given).toBe('Bob');
    });
  }

  it('multiple roles between the same pair all round-trip (5.5.1)', async () => {
    const p1 = await createPerson(db, { sex: 'M', given_name: 'A' });
    const p2 = await createPerson(db, { sex: 'F', given_name: 'B' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'friend' });
    await createPersonAssociation(db, { person_id: p1.id, related_person_id: p2.id, role: 'colleague' });

    const { ged } = await exportGedcom(db, '5.5.1');
    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));

    const reimported = await listPersons(db2);
    const a = reimported.find((pp) => /A$/.test(`${pp.given_name ?? ''}`)
      || pp.given_name === 'A');
    expect(a).toBeDefined();
    const assocs = await getAssociationsForPerson(db2, a!.id);
    const roles = new Set(assocs.map((x) => x.role));
    expect(roles).toEqual(new Set(['friend', 'colleague']));
  });
});
