import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => { db = createTestDb(); });

// Sample GEDCOM with INDI, FAM, SOUR, REPO, SUBM records
const SAMPLE_GEDCOM = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @S1@ SUBM
1 NAME Test Submitter
0 @R1@ REPO
1 NAME Test Archive
0 @S1@ SOUR
1 TITL Test Source
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR`;

const SAMPLE_WITH_LDS = `0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME John /Smith/
1 BAPL
2 DATE 1 JAN 2000
1 SLGC
2 DATE 2 FEB 2001
0 TRLR`;

describe('ValidationReport', () => {
  describe('rawCounts', () => {
    it('correctly counts INDI, FAM, SOUR, REPO, SUBM records', () => {
      const tree = parseGedcom(SAMPLE_GEDCOM);
      const report = importGedcom(db, tree);

      expect(report.rawCounts.individuals).toBe(2);
      expect(report.rawCounts.families).toBe(1);
      expect(report.rawCounts.sources).toBe(1);
      expect(report.rawCounts.repositories).toBe(1);
      expect(report.rawCounts.submitters).toBe(1);
    });

    it('counts zero for missing record types', () => {
      const tree = parseGedcom(`0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Solo /Person/\n0 TRLR`);
      const report = importGedcom(db, tree);

      expect(report.rawCounts.repositories).toBe(0);
      expect(report.rawCounts.submitters).toBe(0);
      expect(report.rawCounts.families).toBe(0);
      expect(report.rawCounts.notes).toBe(0);
    });
  });

  describe('unmappedData', () => {
    it('does not include REPO entries in unmappedData (REPO records are now imported)', () => {
      const tree = parseGedcom(SAMPLE_GEDCOM);
      const report = importGedcom(db, tree);

      const repoEntry = report.unmappedData.find(u => u.category.includes('REPO'));
      expect(repoEntry).toBeUndefined();
    });

    it('does not include SUBM entries in unmappedData (SUBM is now matched to a person)', () => {
      const tree = parseGedcom(SAMPLE_GEDCOM);
      const report = importGedcom(db, tree);

      const submEntry = report.unmappedData.find(u => u.category.includes('SUBM'));
      expect(submEntry).toBeUndefined();
    });

    it('does not include REPO entry when no REPO records', () => {
      const tree = parseGedcom(`0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Solo /Person/\n0 TRLR`);
      const report = importGedcom(db, tree);

      const repoEntry = report.unmappedData.find(u => u.category.includes('REPO'));
      expect(repoEntry).toBeUndefined();
    });

    it('includes LDS ordinances when present', () => {
      const tree = parseGedcom(SAMPLE_WITH_LDS);
      const report = importGedcom(db, tree);

      const ldsEntry = report.unmappedData.find(u => u.category.includes('LDS'));
      expect(ldsEntry).toBeDefined();
      expect(ldsEntry?.count).toBe(2);
    });
  });

  describe('modelLimitations', () => {
    it('does not include ASSO in modelLimitations when no ASSO nodes are present', () => {
      const tree = parseGedcom(SAMPLE_GEDCOM);
      const report = importGedcom(db, tree);

      expect(report.modelLimitations.some(l => l.includes('ASSO'))).toBe(false);
    });

    it('does not include ASSO in modelLimitations for minimal GEDCOM', () => {
      const tree = parseGedcom(`0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 TRLR`);
      const report = importGedcom(db, tree);

      expect(report.modelLimitations.some(l => l.includes('ASSO'))).toBe(false);
    });
  });

  describe('tagStats', () => {
    it('mirrors skipped field (same tags, different shape)', () => {
      const tree = parseGedcom(`0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME John /Smith/\n1 _CUSTOM unknown tag\n0 TRLR`);
      const report = importGedcom(db, tree);

      // skipped and tagStats should represent the same data
      expect(report.tagStats.length).toBe(report.skipped.length);
      for (const s of report.skipped) {
        const ts = report.tagStats.find(t => t.tag === s.tag);
        expect(ts).toBeDefined();
        expect(ts?.occurrences).toBe(s.count);
      }
    });

    it('tagStats is empty when all tags are recognized', () => {
      const tree = parseGedcom(SAMPLE_GEDCOM);
      const report = importGedcom(db, tree);

      expect(report.tagStats).toEqual([]);
      expect(report.skipped).toEqual([]);
    });
  });
});
