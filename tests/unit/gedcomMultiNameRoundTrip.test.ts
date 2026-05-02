/**
 * GEDCOM round-trip regression test for multiple person_names rows.
 *
 * User goal (Wave 1B, plan birth-name-display-and-quality-check.md, goal 4):
 * a person with multiple person_names rows survives every export → re-import
 * path with all rows intact. This test guards against silent loss of any of
 * the five name_type values during the GEDCOM round-trip path.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson, addPersonName, getPersonNames, listPersons } from '../../src/api/persons';
import { exportGedcom } from '../../src/gedcom/exporter';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

describe('GEDCOM round-trip: multiple person_names rows', () => {
  it('preserves all five name_type values across export → import', () => {
    // 1. Create one person with NO default birth name (createPerson skips
    // person_names insert when both given_name and surname are absent).
    const p = createPerson(db, { sex: 'F' });

    // 2. Insert all five name_type rows with distinguishable surnames.
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'BirthSur',       name_type: 'birth',       sort_order: 0 });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'MarriedSur',     name_type: 'married',     sort_order: 1 });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'NameChangeSur',  name_type: 'name_change', sort_order: 2 });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'AliasSur',       name_type: 'alias',       sort_order: 3 });
    addPersonName(db, p.id, { given_name: 'Anna', surname: 'AkaSur',         name_type: 'aka',         sort_order: 4 });

    const sourceNames = getPersonNames(db, p.id);
    expect(sourceNames).toHaveLength(5);

    // 3. Export.
    const { ged } = exportGedcom(db, '5.5.1');

    // 4. Parse + import into a fresh DB.
    const db2 = createTestDb();
    const tree = parseGedcom(ged);
    importGedcom(db2, tree);

    // 5. Find the imported person and assert all five name rows survived.
    const persons = listPersons(db2);
    expect(persons).toHaveLength(1);
    const imported = persons[0];

    const importedNames = getPersonNames(db2, imported.id);
    expect(importedNames).toHaveLength(5);

    // Map by name_type and verify each row's surname round-tripped.
    const byType = new Map(importedNames.map(n => [n.name_type, n]));
    expect(byType.get('birth')?.surname).toBe('BirthSur');
    expect(byType.get('married')?.surname).toBe('MarriedSur');
    expect(byType.get('name_change')?.surname).toBe('NameChangeSur');
    expect(byType.get('alias')?.surname).toBe('AliasSur');
    expect(byType.get('aka')?.surname).toBe('AkaSur');

    // Belt-and-braces: every expected name_type appears exactly once.
    const seenTypes = importedNames.map(n => n.name_type).sort();
    expect(seenTypes).toEqual(['aka', 'alias', 'birth', 'married', 'name_change']);
  });
});
