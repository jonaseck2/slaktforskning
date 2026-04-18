import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createPerson } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import {
  getPersonIdsInBranch,
  filterPersonsByOptions,
  applyExportOptions,
  DEFAULT_EXPORT_OPTIONS,
} from '../../src/api/export_options';
import type { ExportOptions } from '../../src/api/export_options';
import { createTestDb } from './helpers';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('filterPersonsByOptions', () => {
  it('returns all persons when excludeLiving is false', () => {
    const p1 = createPerson(db, { given_name: 'Alice', living: true });
    const p2 = createPerson(db, { given_name: 'Bob', living: false });
    const persons = [p1, p2].map(p => ({ ...p, given_name: '', surname: '' }));
    const result = filterPersonsByOptions(db, persons, { ...DEFAULT_EXPORT_OPTIONS, excludeLiving: false });
    expect(result).toHaveLength(2);
  });

  it('filters out living persons when excludeLiving is true', () => {
    const p1 = createPerson(db, { given_name: 'Alice', living: true });
    const p2 = createPerson(db, { given_name: 'Bob', living: false });
    const persons = [p1, p2].map(p => ({ ...p, given_name: '', surname: '' }));
    const result = filterPersonsByOptions(db, persons, { ...DEFAULT_EXPORT_OPTIONS, excludeLiving: true });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(p2.id);
  });
});

describe('getPersonIdsInBranch', () => {
  /**
   * Build a 3-generation family tree:
   *   grandparent1 + grandparent2
   *       |
   *     parent + spouse
   *       |
   *     child
   */
  function buildFamily() {
    const grandparent1 = createPerson(db, { given_name: 'GP1', sex: 'M' });
    const grandparent2 = createPerson(db, { given_name: 'GP2', sex: 'F' });
    const parent = createPerson(db, { given_name: 'Parent', sex: 'M' });
    const spouse = createPerson(db, { given_name: 'Spouse', sex: 'F' });
    const child = createPerson(db, { given_name: 'Child', sex: 'M' });

    // grandparent couple
    createRelationship(db, { type: 'couple', person1_id: grandparent1.id, person2_id: grandparent2.id });
    // grandparent -> parent
    createRelationship(db, { type: 'parent_child', person1_id: grandparent1.id, person2_id: parent.id });
    createRelationship(db, { type: 'parent_child', person1_id: grandparent2.id, person2_id: parent.id });
    // parent couple
    createRelationship(db, { type: 'couple', person1_id: parent.id, person2_id: spouse.id });
    // parent -> child
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    return { grandparent1, grandparent2, parent, spouse, child };
  }

  it('finds ancestors from child', () => {
    const { grandparent1, grandparent2, parent, spouse, child } = buildFamily();
    const ids = getPersonIdsInBranch(db, child.id, 'ancestors');
    // child -> parent -> gp1, gp2. Spouses included: spouse (of parent), gp2 (of gp1).
    expect(ids.has(child.id)).toBe(true);
    expect(ids.has(parent.id)).toBe(true);
    expect(ids.has(grandparent1.id)).toBe(true);
    expect(ids.has(grandparent2.id)).toBe(true);
    expect(ids.has(spouse.id)).toBe(true); // spouse of parent
  });

  it('finds descendants from grandparent', () => {
    const { grandparent1, grandparent2, parent, spouse, child } = buildFamily();
    const ids = getPersonIdsInBranch(db, grandparent1.id, 'descendants');
    expect(ids.has(grandparent1.id)).toBe(true);
    expect(ids.has(parent.id)).toBe(true);
    expect(ids.has(child.id)).toBe(true);
    expect(ids.has(spouse.id)).toBe(true); // spouse of parent
    expect(ids.has(grandparent2.id)).toBe(true); // spouse of grandparent1
  });

  it('finds both directions from parent', () => {
    const { grandparent1, grandparent2, parent, spouse, child } = buildFamily();
    const ids = getPersonIdsInBranch(db, parent.id, 'both');
    expect(ids.has(grandparent1.id)).toBe(true);
    expect(ids.has(grandparent2.id)).toBe(true);
    expect(ids.has(parent.id)).toBe(true);
    expect(ids.has(spouse.id)).toBe(true);
    expect(ids.has(child.id)).toBe(true);
  });

  it('limits generations depth', () => {
    const { grandparent1, grandparent2, parent, child } = buildFamily();
    // From child, 1 generation of ancestors = parent only (plus spouse)
    const ids = getPersonIdsInBranch(db, child.id, 'ancestors', 1);
    expect(ids.has(child.id)).toBe(true);
    expect(ids.has(parent.id)).toBe(true);
    // grandparents should NOT be included (they are 2 generations away)
    expect(ids.has(grandparent1.id)).toBe(false);
    expect(ids.has(grandparent2.id)).toBe(false);
  });

  it('includes spouses in couple relationships', () => {
    const p1 = createPerson(db, { given_name: 'P1', sex: 'M' });
    const p2 = createPerson(db, { given_name: 'P2', sex: 'F' });
    createRelationship(db, { type: 'couple', person1_id: p1.id, person2_id: p2.id });
    const ids = getPersonIdsInBranch(db, p1.id, 'ancestors');
    expect(ids.has(p1.id)).toBe(true);
    expect(ids.has(p2.id)).toBe(true);
  });
});

describe('applyExportOptions', () => {
  it('returns null personIds when no filters are active', () => {
    const result = applyExportOptions(db, DEFAULT_EXPORT_OPTIONS);
    expect(result.personIds).toBeNull();
    expect(result.includeMedia).toBe(true);
    expect(result.includeNotes).toBe(true);
    expect(result.includeSources).toBe(true);
  });

  it('excludes living persons', () => {
    const alive = createPerson(db, { given_name: 'Alive', living: true });
    const dead = createPerson(db, { given_name: 'Dead', living: false });
    const result = applyExportOptions(db, { ...DEFAULT_EXPORT_OPTIONS, excludeLiving: true });
    expect(result.personIds).not.toBeNull();
    expect(result.personIds!.has(alive.id)).toBe(false);
    expect(result.personIds!.has(dead.id)).toBe(true);
  });

  it('combines branch filter and living filter', () => {
    const gp = createPerson(db, { given_name: 'GP', sex: 'M', living: false });
    const parent = createPerson(db, { given_name: 'Parent', sex: 'M', living: true });
    const child = createPerson(db, { given_name: 'Child', sex: 'M', living: true });
    const unrelated = createPerson(db, { given_name: 'Unrelated', living: false });

    createRelationship(db, { type: 'parent_child', person1_id: gp.id, person2_id: parent.id });
    createRelationship(db, { type: 'parent_child', person1_id: parent.id, person2_id: child.id });

    const opts: ExportOptions = {
      ...DEFAULT_EXPORT_OPTIONS,
      excludeLiving: true,
      branchFilter: { personId: child.id, direction: 'ancestors' },
    };
    const result = applyExportOptions(db, opts);
    expect(result.personIds).not.toBeNull();
    // GP is in branch and dead -> included
    expect(result.personIds!.has(gp.id)).toBe(true);
    // Parent is in branch but living -> excluded
    expect(result.personIds!.has(parent.id)).toBe(false);
    // Child is in branch but living -> excluded
    expect(result.personIds!.has(child.id)).toBe(false);
    // Unrelated is not in branch -> excluded
    expect(result.personIds!.has(unrelated.id)).toBe(false);
  });

  it('passes through content flags', () => {
    const result = applyExportOptions(db, {
      excludeLiving: false,
      includeMedia: false,
      includeNotes: false,
      includeSources: false,
    });
    expect(result.includeMedia).toBe(false);
    expect(result.includeNotes).toBe(false);
    expect(result.includeSources).toBe(false);
  });
});
