// T09: GEDCOM SEX X (intersex) round-trip.
//
// User goal: an authored `persons.sex = 'X'` survives a GEDCOM 7.0
// round-trip lossless. On 5.5.1 (which only allows M/F/U) it downgrades
// to 'U' and the ExportReport's `warnings[]` discloses the loss so the
// user knows what changed.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createPerson, listPersons } from '../../src/api/persons';
import { createTestDb } from './helpers';

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => { db = await createTestDb(); });

describe('GEDCOM SEX X round-trip (T09)', () => {
  it('7.0: exports `1 SEX X` and round-trips to sex=X', async () => {
    await createPerson(db, { sex: 'X', given_name: 'Alex', surname: 'Test' });

    const { ged, report } = await exportGedcom(db, '7.0');
    expect(ged).toContain('1 SEX X');
    // No warning expected on 7.0 — X is in the 7.0 vocab.
    expect(report.warnings.filter(w => /sex/i.test(w))).toHaveLength(0);

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const persons = await listPersons(db2);
    const alex = persons.find(p => /Alex/.test(p.given_name ?? ''));
    expect(alex).toBeDefined();
    expect(alex!.sex).toBe('X');
  });

  it('5.5.1: downgrades SEX X to SEX U + emits a disclosure warning', async () => {
    const seeded = await createPerson(db, { sex: 'X', given_name: 'Alex', surname: 'Test' });

    const { ged, report } = await exportGedcom(db, '5.5.1');
    expect(ged).toContain('1 SEX U');
    expect(ged).not.toContain('1 SEX X');
    // Warning must name both the person id and the downgrade direction.
    const sexWarning = report.warnings.find(w => w.includes(seeded.id) && /X.*U/i.test(w));
    expect(sexWarning, 'expected ExportReport.warnings to disclose X→U downgrade').toBeDefined();

    const db2 = await createTestDb();
    await importGedcom(db2, parseGedcom(ged));
    const persons = await listPersons(db2);
    const alex = persons.find(p => /Alex/.test(p.given_name ?? ''));
    expect(alex).toBeDefined();
    expect(alex!.sex).toBe('U');
  });
});
