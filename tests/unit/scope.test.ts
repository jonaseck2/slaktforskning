import { describe, it, expect, beforeEach } from 'vitest';
import { createPerson } from '../../src/api/persons';
import { createRelationship } from '../../src/api/relationships';
import { computeScope } from '../../src/api/html_site/scope';
import { createTestDb } from './helpers';

let db: any;
beforeEach(async () => { db = await createTestDb(); });

describe('computeScope', async () => {
  it('returns just the focus person when no relationships and 0 generations', async () => {
    const p = await createPerson(db, { given_name: 'Anna' });
    const ids = await computeScope(db, { focusId: p.id, ancestors: 0, descendants: 0 });
    expect([...ids]).toEqual([p.id]);
  });

  it('includes ancestors up to N generations, plus their spouses', async () => {
    const child = await createPerson(db, { given_name: 'C' });
    const father = await createPerson(db, { given_name: 'F' });
    const mother = await createPerson(db, { given_name: 'M' });
    const grandpa = await createPerson(db, { given_name: 'G' });
    await createRelationship(db, { type: 'parent_child', person1_id: father.id, person2_id: child.id });
    await createRelationship(db, { type: 'parent_child', person1_id: mother.id, person2_id: child.id });
    await createRelationship(db, { type: 'couple', person1_id: father.id, person2_id: mother.id });
    await createRelationship(db, { type: 'parent_child', person1_id: grandpa.id, person2_id: father.id });

    const ids = await computeScope(db, { focusId: child.id, ancestors: 1, descendants: 0 });
    expect(ids).toEqual(new Set([child.id, father.id, mother.id]));

    const ids2 = await computeScope(db, { focusId: child.id, ancestors: 2, descendants: 0 });
    expect(ids2).toEqual(new Set([child.id, father.id, mother.id, grandpa.id]));
  });

  it('includes descendants up to M generations, plus their spouses', async () => {
    const root = await createPerson(db, { given_name: 'R' });
    const son = await createPerson(db, { given_name: 'S' });
    const daughterInLaw = await createPerson(db, { given_name: 'D' });
    const grandchild = await createPerson(db, { given_name: 'GC' });
    await createRelationship(db, { type: 'parent_child', person1_id: root.id, person2_id: son.id });
    await createRelationship(db, { type: 'couple', person1_id: son.id, person2_id: daughterInLaw.id });
    await createRelationship(db, { type: 'parent_child', person1_id: son.id, person2_id: grandchild.id });

    const ids = await computeScope(db, { focusId: root.id, ancestors: 0, descendants: 1 });
    expect(ids).toEqual(new Set([root.id, son.id, daughterInLaw.id]));

    const ids2 = await computeScope(db, { focusId: root.id, ancestors: 0, descendants: 2 });
    expect(ids2).toEqual(new Set([root.id, son.id, daughterInLaw.id, grandchild.id]));
  });

  it('returns ALL persons when everyone=true', async () => {
    const a = await createPerson(db, { given_name: 'A' });
    const b = await createPerson(db, { given_name: 'B' });
    const ids = await computeScope(db, { everyone: true });
    expect(ids).toEqual(new Set([a.id, b.id]));
  });
});
