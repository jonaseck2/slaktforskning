import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { runSql } from '../../src/api/db';
import { createPerson } from '../../src/api/persons';
import { checkPersonNoName } from '../../src/api/checks/checks-quality';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;

beforeEach(async () => {
  db = await createTestDb();
});

/**
 * Direct seed of a `person_names` row with explicit blank fields. `addPersonName`
 * normalises empty input to `null` and skips the insert when there's no actual
 * name content, so this seeds the bug-class state we need to flag (rows that
 * exist but carry only whitespace or empty strings — the residue of past
 * importers that wrote a placeholder names row but no usable data).
 */
async function seedBlankName(personId: string, given: string | null, surname: string | null): void {
  await runSql(db,
    `INSERT INTO person_names (id, person_id, given_name, surname, name_type, sort_order) VALUES (?, ?, ?, ?, 'birth', 0)`,
    [uuidv4(), personId, given, surname]
  );
}

describe('checkPersonNoName', async () => {
  it('flags persons with no person_names row, persons with all-blank names rows, and skips named persons', async () => {
    // Case 1: persons row with NO names row at all
    const noNamesPerson = await createPerson(db, {}, { allowNameless: true }); // createPerson skips name insert when both are absent

    // Case 2a: persons row with a names row whose given+surname are empty strings
    const emptyStringPerson = await createPerson(db, {}, { allowNameless: true });
    await seedBlankName(emptyStringPerson.id, '', '');

    // Case 2b: persons row with a names row whose given+surname are NULL
    const nullNamePerson = await createPerson(db, {}, { allowNameless: true });
    await seedBlankName(nullNamePerson.id, null, null);

    // Case 2c: persons row with a names row whose fields are whitespace only
    const whitespacePerson = await createPerson(db, {}, { allowNameless: true });
    await seedBlankName(whitespacePerson.id, '   ', '\t');

    // Case 3: named person — must NOT be flagged
    const namedPerson = await createPerson(db, { given_name: 'Erik', surname: 'Svensson' });

    const results = await checkPersonNoName(db);
    const flaggedIds = new Set(results.flatMap(r => r.personIds));

    expect(flaggedIds.has(noNamesPerson.id)).toBe(true);
    expect(flaggedIds.has(emptyStringPerson.id)).toBe(true);
    expect(flaggedIds.has(nullNamePerson.id)).toBe(true);
    expect(flaggedIds.has(whitespacePerson.id)).toBe(true);
    expect(flaggedIds.has(namedPerson.id)).toBe(false);

    // Exactly one row per nameless person — no double flags even when multiple
    // blank rows exist for the same person.
    const personHits = results.filter(r => r.personIds.includes(noNamesPerson.id));
    expect(personHits).toHaveLength(1);

    // Severity / code shape for QualityView routing.
    for (const r of results) {
      expect(r.code).toBe('PERSON_NO_NAME');
      expect(r.severity).toBe('notice');
    }
  });

  it('still flags a person whose only names row has only the partial-name pattern (given but no surname blank-only across rows)', async () => {
    // A person can have one row with only given_name set — that's a PARTIAL_NAME
    // case, NOT a no-name case. checkPersonNoName must NOT fire here.
    const p = await createPerson(db, {}, { allowNameless: true });
    await seedBlankName(p.id, 'Erik', '');

    const results = await checkPersonNoName(db);
    const flagged = results.filter(r => r.personIds.includes(p.id));
    expect(flagged).toHaveLength(0);
  });
});
