/**
 * GEDCOM compatibility / hardening tests.
 *
 * Each test imports a synthetic fixture file into an in-memory DB and verifies:
 * - No crash
 * - Expected entity counts
 * - No data corruption
 * - Appropriate warnings for known issues
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { parseGedcomDate } from '../../src/gedcom/date';
import { importGedcom, previewGedcomImport } from '../../src/import/gedcom';
import { listPersons, getPersonNames } from '../../src/api/persons';
import { listRelationships } from '../../src/api/relationships';
import { getEventsForPerson } from '../../src/api/events';
import { createTestDb } from './helpers';

const FIXTURES = path.resolve(__dirname, '../fixtures/gedcom');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

// ──────────────────────────────────────────────
// encoding.ged — UTF-8 characters preserved
// ──────────────────────────────────────────────
describe('encoding.ged', () => {
  it('imports without error and preserves UTF-8 characters', () => {
    const tree = parseGedcom(loadFixture('encoding.ged'));
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(2);

    const persons = listPersons(db);
    expect(persons.length).toBe(2);

    // Check Swedish characters
    const ake = persons.find(p => p.given_name?.includes('Åke'));
    expect(ake).toBeDefined();
    const names = getPersonNames(db, ake!.id);
    expect(names[0].given_name).toBe('Åke Göran');
    expect(names[0].surname).toBe('Österberg');

    // Check German/Polish characters in notes
    const person1 = persons.find(p => p.given_name?.includes('Åke'));
    expect(person1?.notes).toContain('München');
    expect(person1?.notes).toContain('Weißbier');
    expect(person1?.notes).toContain('Łódź');
    expect(person1?.notes).toContain('Kraków');

    // Check CJK characters preserved
    expect(person1?.notes).toContain('日本語テスト');
    expect(person1?.notes).toContain('中文测试');
  });

  it('preserves special characters in person2', () => {
    const tree = parseGedcom(loadFixture('encoding.ged'));
    importGedcom(db, tree);
    const persons = listPersons(db);
    const arla = persons.find(p => p.surname === 'Björk');
    expect(arla).toBeDefined();
    const names = getPersonNames(db, arla!.id);
    expect(names[0].given_name).toContain('Ärla');
    expect(names[0].given_name).toContain('Üllä');
  });
});

// ──────────────────────────────────────────────
// minimal.ged — smallest valid GEDCOM
// ──────────────────────────────────────────────
describe('minimal.ged', () => {
  it('imports 1 person with no errors', () => {
    const tree = parseGedcom(loadFixture('minimal.ged'));
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(1);
    expect(report.warnings.length).toBe(0);

    const persons = listPersons(db);
    expect(persons.length).toBe(1);
    expect(persons[0].given_name).toBe('Anna');
    expect(persons[0].surname).toBe('Svensson');
  });
});

// ──────────────────────────────────────────────
// empty_fields.ged — records with empty/missing names
// ──────────────────────────────────────────────
describe('empty_fields.ged', () => {
  it('creates persons even with empty or partial names', () => {
    const tree = parseGedcom(loadFixture('empty_fields.ged'));
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(4);

    const persons = listPersons(db);
    expect(persons.length).toBe(4);

    // Person with NAME // should exist but have empty name parts
    // At least one person should have no given_name and no surname
    const hasEmptyNames = persons.some(p => !p.given_name && !p.surname);
    expect(hasEmptyNames).toBe(true);

    // Person with only surname
    const surnameOnly = persons.find(p => p.surname === 'Only Surname' && !p.given_name);
    expect(surnameOnly).toBeDefined();

    // Person with given name and empty surname slashes (NAME Given Only //)
    // The regex requires at least one char between slashes, so // doesn't match as surname.
    // The full value "Given Only //" is stored as given_name.
    const givenOnly = persons.find(p => p.given_name?.includes('Given Only'));
    expect(givenOnly).toBeDefined();
  });

  it('creates person with no NAME tag at all', () => {
    const tree = parseGedcom(loadFixture('empty_fields.ged'));
    importGedcom(db, tree);
    const persons = listPersons(db);
    // @I4@ has no NAME tag — person created but with no person_names row
    expect(persons.length).toBe(4);
  });
});

// ──────────────────────────────────────────────
// deep_nesting.ged — multi-line CONT/CONC notes
// ──────────────────────────────────────────────
describe('deep_nesting.ged', () => {
  it('preserves multi-line notes with CONT and CONC', () => {
    const tree = parseGedcom(loadFixture('deep_nesting.ged'));
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(1);

    const persons = listPersons(db);
    const karl = persons[0];
    // CONT lines add newlines, CONC appends directly
    expect(karl.notes).toContain('Line 1 of a very long note.');
    expect(karl.notes).toContain('Line 10 continues here.');
    expect(karl.notes).toContain('(appended without newline)');

    // Count the number of lines (10 CONT lines = 10 newlines in the note)
    const lines = karl.notes!.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(10);

    // Verify CONC appends without newline (parser trims the value, so no space before the appended text)
    expect(karl.notes).toContain('Line 10 continues here.(appended without newline)');
  });
});

// ──────────────────────────────────────────────
// large_family.ged — 1 couple with 22 children
// ──────────────────────────────────────────────
describe('large_family.ged', () => {
  it('imports all persons and relationships', () => {
    const tree = parseGedcom(loadFixture('large_family.ged'));
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(24); // 2 parents + 22 children

    const persons = listPersons(db);
    expect(persons.length).toBe(24);

    // Check couple relationship exists
    const rels = listRelationships(db);
    const couples = rels.filter(r => r.type === 'couple');
    expect(couples.length).toBe(1);

    // Check parent-child relationships: 22 children * 2 parents = 44
    const parentChild = rels.filter(r => r.type === 'parent_child');
    expect(parentChild.length).toBe(44);
  });

  it('does not create duplicate relationships', () => {
    const tree = parseGedcom(loadFixture('large_family.ged'));
    importGedcom(db, tree);

    const rels = listRelationships(db);
    // All parent_child relationships should be unique
    const parentChild = rels.filter(r => r.type === 'parent_child');
    const uniquePairs = new Set(parentChild.map(r => `${r.person1_id}-${r.person2_id}`));
    expect(uniquePairs.size).toBe(parentChild.length);
  });
});

// ──────────────────────────────────────────────
// non_standard_tags.ged — custom extension tags
// ──────────────────────────────────────────────
describe('non_standard_tags.ged', () => {
  it('imports successfully and reports unknown tags', () => {
    const tree = parseGedcom(loadFixture('non_standard_tags.ged'));
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(2);

    // Unknown tags should be in skipped/tagStats
    const unknownTags = report.skipped.map(s => s.tag);
    expect(unknownTags).toContain('_MTTAG');
    expect(unknownTags).toContain('_PHOTO');
    expect(unknownTags).toContain('_CUSTOM');
    expect(unknownTags).toContain('_WEBTAG');
  });

  it('does not crash on custom tags', () => {
    const tree = parseGedcom(loadFixture('non_standard_tags.ged'));
    // Should not throw
    expect(() => importGedcom(db, tree)).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// malformed_dates.ged — non-standard date formats
// ──────────────────────────────────────────────
describe('malformed_dates.ged', () => {
  it('imports all persons without crashing', () => {
    const tree = parseGedcom(loadFixture('malformed_dates.ged'));
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(7);
  });

  it('parses "abt. 1850" as about', () => {
    const result = parseGedcomDate('abt. 1850');
    expect(result.date_type).toBe('about');
    expect(result.date_value).toBe('1850');
    expect(result.date_original).toBe('abt. 1850');
  });

  it('parses "ca 1900" as about', () => {
    const result = parseGedcomDate('ca 1900');
    expect(result.date_type).toBe('about');
    expect(result.date_value).toBe('1900');
  });

  it('parses "circa 1750" as about', () => {
    const result = parseGedcomDate('circa 1750');
    expect(result.date_type).toBe('about');
    expect(result.date_value).toBe('1750');
  });

  it('parses "1850/1860" as between', () => {
    const result = parseGedcomDate('1850/1860');
    expect(result.date_type).toBe('between');
    expect(result.date_value).toBe('1850');
    expect(result.date_value_end).toBe('1860');
  });

  it('parses "between 1800 and 1810" as between', () => {
    const result = parseGedcomDate('between 1800 and 1810');
    expect(result.date_type).toBe('between');
    expect(result.date_value).toBe('1800');
    expect(result.date_value_end).toBe('1810');
  });

  it('parses "?" as unknown', () => {
    const result = parseGedcomDate('?');
    expect(result.date_type).toBe('unknown');
    expect(result.date_value).toBeNull();
  });

  it('parses "13th century" as unknown with original preserved', () => {
    const result = parseGedcomDate('13th century');
    expect(result.date_type).toBe('unknown');
    expect(result.date_original).toBe('13th century');
  });

  it('stores original text for all malformed dates', () => {
    const tree = parseGedcom(loadFixture('malformed_dates.ged'));
    importGedcom(db, tree);
    const persons = listPersons(db);
    for (const person of persons) {
      const events = getEventsForPerson(db, person.id);
      for (const event of events) {
        // Every event should have date_original preserved
        expect(event.date_original).toBeTruthy();
      }
    }
  });
});

// ──────────────────────────────────────────────
// mixed_line_endings.ged — different line ending styles
// ──────────────────────────────────────────────
describe('mixed_line_endings.ged', () => {
  it('parses all records correctly regardless of line endings', () => {
    const tree = parseGedcom(loadFixture('mixed_line_endings.ged'));
    const report = importGedcom(db, tree);
    expect(report.persons).toBe(2);

    const persons = listPersons(db);
    expect(persons.length).toBe(2);
    const names = persons.map(p => p.given_name).sort();
    expect(names).toContain('Anna');
    expect(names).toContain('Erik');
  });
});

// ──────────────────────────────────────────────
// duplicate_xrefs.ged — same xref for multiple records
// ──────────────────────────────────────────────
describe('duplicate_xrefs.ged', () => {
  it('imports without crashing', () => {
    const tree = parseGedcom(loadFixture('duplicate_xrefs.ged'));
    // The parser treats duplicate xrefs as separate nodes in the tree;
    // the importer creates a new person for each INDI node.
    // The second @I1@ overwrites the first in the personMap, which is
    // acceptable behavior — the important thing is no crash.
    expect(() => importGedcom(db, tree)).not.toThrow();
  });

  it('creates persons for all INDI records', () => {
    const tree = parseGedcom(loadFixture('duplicate_xrefs.ged'));
    const report = importGedcom(db, tree);
    // Both @I1@ INDIs + @I2@ = 3 persons created in DB
    // (the personMap maps @I1@ to the last one, but both DB rows exist)
    expect(report.persons).toBe(3);
  });
});

// ──────────────────────────────────────────────
// previewGedcomImport — preview without DB writes
// ──────────────────────────────────────────────
describe('previewGedcomImport', () => {
  it('returns correct counts for large_family.ged', () => {
    const tree = parseGedcom(loadFixture('large_family.ged'));
    const preview = previewGedcomImport(tree);
    expect(preview.personCount).toBe(24);
    expect(preview.relationshipCount).toBeGreaterThan(0);
    expect(preview.estimatedSize).toBe('small'); // < 50 total entities
  });

  it('returns correct counts for minimal.ged', () => {
    const tree = parseGedcom(loadFixture('minimal.ged'));
    const preview = previewGedcomImport(tree);
    expect(preview.personCount).toBe(1);
    expect(preview.sourceCount).toBe(0);
    expect(preview.estimatedSize).toBe('small');
  });

  it('does not write to database', () => {
    const tree = parseGedcom(loadFixture('large_family.ged'));
    const personsBefore = listPersons(db).length;
    previewGedcomImport(tree);
    const personsAfter = listPersons(db).length;
    expect(personsAfter).toBe(personsBefore);
  });

  it('detects unknown top-level tags', () => {
    const tree = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 _WEIRD CUSTOM\n0 TRLR');
    const preview = previewGedcomImport(tree);
    expect(preview.warnings.some(w => w.includes('_WEIRD'))).toBe(true);
  });

  it('warns when version is unknown', () => {
    const tree = parseGedcom('0 HEAD\n0 @I1@ INDI\n1 NAME Test /Person/\n0 TRLR');
    const preview = previewGedcomImport(tree);
    expect(preview.warnings.some(w => w.includes('version'))).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Parser edge cases
// ──────────────────────────────────────────────
describe('parser edge cases', () => {
  it('handles empty input', () => {
    const tree = parseGedcom('');
    expect(tree).toEqual([]);
  });

  it('handles input with only blank lines', () => {
    const tree = parseGedcom('\n\n\n');
    expect(tree).toEqual([]);
  });

  it('handles lines with extra whitespace', () => {
    const tree = parseGedcom('  0 HEAD  \n  1 GEDC  \n  2 VERS 5.5.1  \n  0 TRLR  ');
    const head = tree.find(n => n.tag === 'HEAD');
    expect(head).toBeDefined();
  });

  it('skips malformed lines gracefully', () => {
    const text = '0 HEAD\n1 GEDC\nNOT A VALID LINE\n2 VERS 5.5.1\n0 TRLR';
    // Should not throw
    const tree = parseGedcom(text);
    expect(tree.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// Date parser edge cases
// ──────────────────────────────────────────────
describe('date parser non-standard formats', () => {
  it('parses "ABT. 1850" (with period)', () => {
    const result = parseGedcomDate('ABT. 1850');
    expect(result.date_type).toBe('about');
    expect(result.date_value).toBe('1850');
  });

  it('parses "CA. 1900" (with period)', () => {
    const result = parseGedcomDate('CA. 1900');
    expect(result.date_type).toBe('about');
    expect(result.date_value).toBe('1900');
  });

  it('parses "c. 1800"', () => {
    const result = parseGedcomDate('c. 1800');
    expect(result.date_type).toBe('about');
    expect(result.date_value).toBe('1800');
  });

  it('parses "approx 1850"', () => {
    const result = parseGedcomDate('approx 1850');
    expect(result.date_type).toBe('about');
    expect(result.date_value).toBe('1850');
  });

  it('parses "1800-1850" as between', () => {
    const result = parseGedcomDate('1800-1850');
    expect(result.date_type).toBe('between');
    expect(result.date_value).toBe('1800');
    expect(result.date_value_end).toBe('1850');
  });

  it('parses "before 1900" (full word)', () => {
    const result = parseGedcomDate('before 1900');
    expect(result.date_type).toBe('before');
    expect(result.date_value).toBe('1900');
  });

  it('parses "after 1800" (full word)', () => {
    const result = parseGedcomDate('after 1800');
    expect(result.date_type).toBe('after');
    expect(result.date_value).toBe('1800');
  });

  it('never crashes on any input', () => {
    const weirdInputs = ['', '???', 'unknown', 'N/A', '  ', '0', '-1', 'INVALID DATE STRING'];
    for (const input of weirdInputs) {
      expect(() => parseGedcomDate(input)).not.toThrow();
      const result = parseGedcomDate(input);
      expect(result.date_original).toBeDefined();
    }
  });

  it('preserves standard GEDCOM date parsing', () => {
    // Ensure we haven't broken standard parsing
    expect(parseGedcomDate('ABT 1850').date_type).toBe('about');
    expect(parseGedcomDate('BEF 1900').date_type).toBe('before');
    expect(parseGedcomDate('AFT 1800').date_type).toBe('after');
    expect(parseGedcomDate('BET 1800 AND 1850').date_type).toBe('between');
    expect(parseGedcomDate('15 JAN 1900').date_type).toBe('exact');
    expect(parseGedcomDate('1900').date_type).toBe('exact');
    expect(parseGedcomDate('JAN 1900').date_type).toBe('exact');
  });
});
