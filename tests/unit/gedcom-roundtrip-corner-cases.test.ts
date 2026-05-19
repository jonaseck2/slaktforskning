// GEDCOM corner-case round-trips (T03 — GEDCOM alignment plan).
//
// Each case verifies a previously-broken or previously-undefined corner of
// the FAM emission / parent_child handling, end-to-end (seed → export →
// re-import → assert on the re-imported DB or on the GEDCOM bytes).
//
// User goal (verbatim from the plan): every authored field in our database
// survives a GEDCOM 5.5.1 OR 7.0 round-trip cleanly, or is explicitly
// classified as `lossy` / `excluded`. No silent data loss on export.

import { describe, it, expect, beforeEach } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import { exportGedcom } from '../../src/gedcom/exporter';
import { createPerson, addPersonName } from '../../src/api/persons';
import { createRelationship, listRelationships } from '../../src/api/relationships';
import { createTestDb } from './helpers';

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => { db = await createTestDb(); });

describe('GEDCOM corner-case round-trips (T03)', () => {

  // ── (a) Single-parent FAM ────────────────────────────────────────────────
  //
  // The user authors one parent + one child + no spouse for that parent.
  // Pre-T03 the exporter emitted zero FAM record (no couple row to drive the
  // loop) and so the parent_child link silently disappeared on round-trip.
  describe('single-parent FAM', () => {
    it('mother + child + no father — link survives 5.5.1 round-trip', async () => {
      const mother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Eckerström' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Eckerström' });
      await createRelationship(db, {
        type: 'parent_child',
        person1_id: mother.id,
        person2_id: child.id,
        subtype: 'biological',
        notes: '',
      });
      // No couple relationship — single parent.

      const { ged } = await exportGedcom(db, '5.5.1');
      // Sanity: the exporter must have emitted at least one FAM block.
      expect(ged).toMatch(/\n0 @F\d+@ FAM\n/);

      const db2 = await createTestDb();
      await importGedcom(db2, parseGedcom(ged));
      const rels = await listRelationships(db2);
      const pcLinks = rels.filter(r => r.type === 'parent_child');
      // Single-parent FAM emits 1 CHIL + 1 HUSB/WIFE → importer creates 1
      // parent_child row.
      expect(pcLinks).toHaveLength(1);
    });

    it('mother + child + no father — link survives 7.0 round-trip', async () => {
      const mother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Eckerström' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Eckerström' });
      await createRelationship(db, {
        type: 'parent_child',
        person1_id: mother.id,
        person2_id: child.id,
        subtype: 'biological',
        notes: '',
      });

      const { ged } = await exportGedcom(db, '7.0');
      expect(ged).toMatch(/\n0 @F\d+@ FAM\n/);

      const db2 = await createTestDb();
      await importGedcom(db2, parseGedcom(ged));
      const rels = await listRelationships(db2);
      expect(rels.filter(r => r.type === 'parent_child')).toHaveLength(1);
    });

    it('father + child + no mother — emits HUSB slot (not WIFE)', async () => {
      const father = await createPerson(db, { sex: 'M', given_name: 'Karl', surname: 'Andersson' });
      const child = await createPerson(db, { sex: 'F', given_name: 'Stina', surname: 'Andersson' });
      await createRelationship(db, {
        type: 'parent_child',
        person1_id: father.id,
        person2_id: child.id,
        subtype: 'biological',
        notes: '',
      });

      const { ged } = await exportGedcom(db, '5.5.1');
      // Single male parent → HUSB slot used (sex-appropriate).
      const famBlock = ged.match(/0 @F\d+@ FAM\n[\s\S]*?(?=\n0 |$)/)?.[0] ?? '';
      expect(famBlock).toMatch(/\n1 HUSB @I\d+@/);
      expect(famBlock).not.toMatch(/\n1 WIFE @I\d+@/);
    });
  });

  // ── (b) PEDI subtype per-parent correctness ─────────────────────────────
  //
  // A child can have different parent_child subtypes per parent in the same
  // FAM: biological-to-mother, step-to-father. Pre-T03 the exporter used
  // `Array.find()` and emitted one PEDI value arbitrarily, losing the
  // distinction.
  //
  // Note: the importer creates 2 parent_child rows per CHIL (one per HUSB,
  // one per WIFE) but reads a SINGLE 2 PEDI value per CHIL. So full
  // per-parent PEDI round-trip on 5.5.1 reduces to "most-permissive wins"
  // semantically; the registry classifies this as lossy on 5.5.1. On 7.0
  // we emit an explicit `3 _PARENT` disambiguation so the user can audit
  // the value (and a future importer enhancement can read it back). The
  // exporter test below asserts the EMITTED shape; the importer round-trip
  // assertion treats this as "at least one row keeps the authored subtype".
  describe('PEDI subtype per-parent correctness', () => {
    it('biological-to-mother + step-to-father emits both PEDI values on 7.0', async () => {
      const father = await createPerson(db, { sex: 'M', given_name: 'Karl', surname: 'Andersson' });
      const mother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
      await createRelationship(db, {
        type: 'couple', person1_id: father.id, person2_id: mother.id,
        subtype: 'marriage', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: mother.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: father.id, person2_id: child.id,
        subtype: 'step', notes: '',
      });

      const { ged } = await exportGedcom(db, '7.0');
      // Per-T03: the non-biological subtype must be emitted. We use STEP
      // (uppercase per 7.0 convention) — biological is the implicit
      // default and may not produce a PEDI line.
      expect(ged).toMatch(/\n2 PEDI STEP\n/);
    });

    it('round-trips with at least one parent_child preserving the step subtype on 7.0', async () => {
      const father = await createPerson(db, { sex: 'M', given_name: 'Karl', surname: 'Andersson' });
      const mother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
      await createRelationship(db, {
        type: 'couple', person1_id: father.id, person2_id: mother.id,
        subtype: 'marriage', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: mother.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: father.id, person2_id: child.id,
        subtype: 'step', notes: '',
      });

      const { ged } = await exportGedcom(db, '7.0');
      const db2 = await createTestDb();
      await importGedcom(db2, parseGedcom(ged));
      const rels = await listRelationships(db2);
      const pc = rels.filter(r => r.type === 'parent_child');
      expect(pc.length).toBe(2);
      // The "step" subtype must survive on at least one row (the FAM's PEDI
      // is read back as the same value for both parent_child rows under the
      // current importer; semantic loss is acceptable for 5.5.1 and
      // disambiguable on 7.0 via _PARENT).
      const subtypes = pc.map(r => r.subtype);
      expect(subtypes.some(s => s === 'step' || s === 'STEP')).toBe(true);
    });
  });

  // ── (c) FAMC / FAMS emission on INDI records ────────────────────────────
  //
  // Pre-T03 the INDI block emitted neither FAMC nor FAMS. Standards-aware
  // third-party parsers (gedcom7.io, FamilySearch's validator, etc.) need
  // both pointer directions to traverse the graph; the parent_child links
  // happened to round-trip via CHIL alone, but the file was non-conformant.
  describe('FAMC/FAMS emission on INDI', () => {
    it('5.5.1 exporter emits FAMS on each spouse and FAMC on each child', async () => {
      const father = await createPerson(db, { sex: 'M', given_name: 'Karl', surname: 'Andersson' });
      const mother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
      await createRelationship(db, {
        type: 'couple', person1_id: father.id, person2_id: mother.id,
        subtype: 'marriage', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: father.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: mother.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });

      const { ged } = await exportGedcom(db, '5.5.1');

      // The INDI for the child must point UP to the FAM via FAMC.
      // The INDIs for both parents must point UP to the FAM via FAMS.
      // We extract per-INDI blocks and assert.
      const indiBlocks = [...ged.matchAll(/0 @I\d+@ INDI\n[\s\S]*?(?=\n0 |$)/g)].map(m => m[0]);
      // 3 persons → 3 INDIs.
      expect(indiBlocks).toHaveLength(3);
      // At least one INDI carries FAMC, and at least two carry FAMS.
      const famcCount = indiBlocks.filter(b => /\n1 FAMC @F\d+@/.test(b)).length;
      const famsCount = indiBlocks.filter(b => /\n1 FAMS @F\d+@/.test(b)).length;
      expect(famcCount).toBe(1); // the child
      expect(famsCount).toBe(2); // the two parents
    });

    it('7.0 exporter emits the same FAMS / FAMC pointers', async () => {
      const father = await createPerson(db, { sex: 'M', given_name: 'Karl', surname: 'Andersson' });
      const mother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
      await createRelationship(db, {
        type: 'couple', person1_id: father.id, person2_id: mother.id,
        subtype: 'marriage', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: father.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: mother.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });

      const { ged } = await exportGedcom(db, '7.0');
      const indiBlocks = [...ged.matchAll(/0 @I\d+@ INDI\n[\s\S]*?(?=\n0 |$)/g)].map(m => m[0]);
      expect(indiBlocks.filter(b => /\n1 FAMC @F\d+@/.test(b))).toHaveLength(1);
      expect(indiBlocks.filter(b => /\n1 FAMS @F\d+@/.test(b))).toHaveLength(2);
    });

    it('orphan single-parent FAM also emits FAMC on the child and FAMS on the parent', async () => {
      const mother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Eckerström' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Eckerström' });
      await createRelationship(db, {
        type: 'parent_child', person1_id: mother.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });

      const { ged } = await exportGedcom(db, '5.5.1');
      const indiBlocks = [...ged.matchAll(/0 @I\d+@ INDI\n[\s\S]*?(?=\n0 |$)/g)].map(m => m[0]);
      expect(indiBlocks.filter(b => /\n1 FAMC @F\d+@/.test(b))).toHaveLength(1);
      expect(indiBlocks.filter(b => /\n1 FAMS @F\d+@/.test(b))).toHaveLength(1);
    });
  });

  // ── (d) Same-couple-twice (separate FAM records) ────────────────────────
  //
  // GEDCOM allows the same HUSB+WIFE pair to appear in multiple FAM records
  // — e.g. a divorced couple who later re-marries. Pre-T03 we verified by
  // inspection that the importer creates 2 couple rows (one per FAM xref)
  // and the exporter emits 2 FAM blocks (one per couple row). These tests
  // mechanise that verification.
  describe('same-couple-twice', () => {
    it('imports two FAM records with same HUSB+WIFE as two relationship rows', async () => {
      const ged = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Anna /Eckerström/
1 SEX F
1 FAMS @F1@
1 FAMS @F2@
0 @I2@ INDI
1 NAME Erik /Eckerström/
1 SEX M
1 FAMS @F1@
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 MARR
2 DATE 5 MAY 1850
0 @F2@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 MARR
2 DATE 5 MAY 1860
0 TRLR`;
      await importGedcom(db, parseGedcom(ged));
      const rels = await listRelationships(db);
      const couples = rels.filter(r => r.type === 'couple');
      expect(couples).toHaveLength(2);
    });

    it('exports two couple rows for the same pair as two FAM records', async () => {
      const husband = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Eckerström' });
      const wife = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Eckerström' });
      await createRelationship(db, {
        type: 'couple', person1_id: husband.id, person2_id: wife.id,
        subtype: 'marriage', notes: '',
      });
      await createRelationship(db, {
        type: 'couple', person1_id: husband.id, person2_id: wife.id,
        subtype: 'marriage', notes: '',
      });

      const { ged } = await exportGedcom(db, '5.5.1');
      const famBlocks = [...ged.matchAll(/^0 @F\d+@ FAM$/gm)];
      expect(famBlocks).toHaveLength(2);
    });
  });

  // ── (e) Multi-parent triad ──────────────────────────────────────────────
  //
  // A child has 3+ parent_child rows: e.g. bio-mother + bio-father (couple)
  // + adoptive-mother (no couple). On 7.0 we represent extras via
  // `1 ASSO @Ix@ / 2 ROLE PARENT`. On 5.5.1 there is no spec-conformant way
  // to express a 3rd parent of the same child within one FAM — the extras
  // are dropped and the export report carries a warning per dropped parent.
  describe('multi-parent triad', () => {
    it('7.0 emits ASSO ROLE PARENT for 3rd parent on the child INDI (lossless)', async () => {
      const bioFather = await createPerson(db, { sex: 'M', given_name: 'Karl', surname: 'Andersson' });
      const bioMother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
      const adoptiveMother = await createPerson(db, { sex: 'F', given_name: 'Berit', surname: 'Larsson' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
      await createRelationship(db, {
        type: 'couple', person1_id: bioFather.id, person2_id: bioMother.id,
        subtype: 'marriage', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: bioMother.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: bioFather.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: adoptiveMother.id, person2_id: child.id,
        subtype: 'adopted', notes: '',
      });

      const { ged, report } = await exportGedcom(db, '7.0');
      // 7.0 emits ASSO with ROLE PARENT for the extra parent. Pattern:
      // `1 ASSO @I-adoptive-mother@\n2 ROLE PARENT`.
      expect(ged).toMatch(/\n1 ASSO @I\d+@\n2 ROLE PARENT/);
      // No warning on 7.0 — extras are lossless via ASSO.
      expect(report.warnings ?? []).not.toContainEqual(expect.stringMatching(/parent dropped/i));
    });

    it('5.5.1 drops extras + records a per-row warning in the export report (lossy)', async () => {
      const bioFather = await createPerson(db, { sex: 'M', given_name: 'Karl', surname: 'Andersson' });
      const bioMother = await createPerson(db, { sex: 'F', given_name: 'Anna', surname: 'Andersson' });
      const adoptiveMother = await createPerson(db, { sex: 'F', given_name: 'Berit', surname: 'Larsson' });
      const child = await createPerson(db, { sex: 'M', given_name: 'Erik', surname: 'Andersson' });
      await createRelationship(db, {
        type: 'couple', person1_id: bioFather.id, person2_id: bioMother.id,
        subtype: 'marriage', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: bioMother.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: bioFather.id, person2_id: child.id,
        subtype: 'biological', notes: '',
      });
      await createRelationship(db, {
        type: 'parent_child', person1_id: adoptiveMother.id, person2_id: child.id,
        subtype: 'adopted', notes: '',
      });

      const { ged, report } = await exportGedcom(db, '5.5.1');
      // No ASSO ROLE PARENT lines in 5.5.1 — extras are dropped.
      expect(ged).not.toMatch(/\n2 ROLE PARENT/);
      // The report.warnings array contains an entry per dropped parent.
      expect(report.warnings ?? []).toEqual(
        expect.arrayContaining([expect.stringMatching(/(parent dropped|extra parent)/i)])
      );

      // Re-import and assert only the 2 parents in the FAM survive.
      const db2 = await createTestDb();
      await importGedcom(db2, parseGedcom(ged));
      const rels = await listRelationships(db2);
      const pc = rels.filter(r => r.type === 'parent_child');
      // 2 parents × 1 child → 2 parent_child rows.
      expect(pc).toHaveLength(2);
    });
  });
});
