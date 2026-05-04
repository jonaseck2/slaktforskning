import { describe, it, expect } from 'vitest';
import {
  sortPersonRelations,
  type RelationRow,
  type RelationsSortGroup,
} from '../../src/api/sortPersonRelations';

// ── helpers ──────────────────────────────────────────────────────────────

const FOCAL = 'focal-1';

function parent(opts: {
  id: string;
  parentId: string;
  parentSex?: 'M' | 'F' | 'U';
  subtype?: 'biological' | 'adopted' | 'foster' | 'step' | 'unknown' | null;
  birthDate?: string | null;
  name?: string;
}): RelationRow {
  return {
    id: opts.id,
    type: 'parent_child',
    subtype: opts.subtype ?? 'biological',
    person1_id: opts.parentId,    // parent
    person2_id: FOCAL,             // child = focal
    direction: 'incoming',
    other: {
      id: opts.parentId,
      display_name: opts.name ?? opts.parentId,
      sex: opts.parentSex ?? 'U',
      birth_date: opts.birthDate ?? null,
    },
    start_date: null,
    other_parent_id: null,
  };
}

function partner(opts: {
  id: string;
  partnerId: string;
  startDate?: string | null;
  name?: string;
  sex?: 'M' | 'F' | 'U';
}): RelationRow {
  return {
    id: opts.id,
    type: 'couple',
    subtype: 'marriage',
    person1_id: FOCAL,
    person2_id: opts.partnerId,
    direction: 'outgoing',
    other: {
      id: opts.partnerId,
      display_name: opts.name ?? opts.partnerId,
      sex: opts.sex ?? 'U',
      birth_date: null,
    },
    start_date: opts.startDate ?? null,
    other_parent_id: null,
  };
}

function child(opts: {
  id: string;
  childId: string;
  otherParentId: string | null;
  birthDate?: string | null;
  name?: string;
}): RelationRow {
  return {
    id: opts.id,
    type: 'parent_child',
    subtype: 'biological',
    person1_id: FOCAL,             // parent = focal
    person2_id: opts.childId,
    direction: 'outgoing',
    other: {
      id: opts.childId,
      display_name: opts.name ?? opts.childId,
      sex: 'U',
      birth_date: opts.birthDate ?? null,
    },
    start_date: null,
    other_parent_id: opts.otherParentId,
  };
}

function other(opts: {
  id: string;
  type: string;
  otherId: string;
  name: string;
  subtype?: string | null;
}): RelationRow {
  return {
    id: opts.id,
    type: opts.type,
    subtype: opts.subtype ?? null,
    person1_id: FOCAL,
    person2_id: opts.otherId,
    direction: 'outgoing',
    other: {
      id: opts.otherId,
      display_name: opts.name,
      sex: 'U',
      birth_date: null,
    },
    start_date: null,
    other_parent_id: null,
  };
}

function run(rows: RelationRow[], locale = 'sv'): RelationsSortGroup[] {
  return sortPersonRelations({ rows, locale });
}

// ── tests ────────────────────────────────────────────────────────────────

describe('sortPersonRelations', () => {
  it('orders biological father before mother (and bio before adoptive)', () => {
    const rows = [
      // Insertion order intentionally jumbled
      parent({ id: 'r-mom-bio', parentId: 'mom1', parentSex: 'F', subtype: 'biological' }),
      parent({ id: 'r-amom', parentId: 'amom', parentSex: 'F', subtype: 'adopted' }),
      parent({ id: 'r-dad-bio', parentId: 'dad1', parentSex: 'M', subtype: 'biological' }),
      parent({ id: 'r-adad', parentId: 'adad', parentSex: 'M', subtype: 'adopted' }),
    ];

    const groups = run(rows);
    const parents = groups.filter(g => g.kind === 'parent');
    expect(parents.length).toBe(4);

    expect(parents[0]).toMatchObject({ kind: 'parent', subtype: 'biological', sex: 'M' });
    expect(parents[1]).toMatchObject({ kind: 'parent', subtype: 'biological', sex: 'F' });
    expect(parents[2]).toMatchObject({ kind: 'parent', subtype: 'adopted', sex: 'M' });
    expect(parents[3]).toMatchObject({ kind: 'parent', subtype: 'adopted', sex: 'F' });
  });

  it('omits empty parent buckets entirely (no foster placeholder)', () => {
    const rows = [
      parent({ id: 'r-dad-bio', parentId: 'dad1', parentSex: 'M', subtype: 'biological' }),
    ];
    const groups = run(rows);
    expect(groups.find(g => g.kind === 'parent' && g.subtype === 'foster')).toBeUndefined();
    expect(groups.length).toBe(1);
  });

  it('orders partners chronologically; null start_date sinks to bottom', () => {
    const rows = [
      partner({ id: 'r-p3', partnerId: 'p3', startDate: null }),
      partner({ id: 'r-p1', partnerId: 'p1', startDate: '1850-06-01' }),
      partner({ id: 'r-p2', partnerId: 'p2', startDate: '1840-01-01' }),
      partner({ id: 'r-p4', partnerId: 'p4', startDate: null }),
    ];
    const groups = run(rows).filter(g => g.kind === 'partner');
    expect(groups.map(g => (g as { row: RelationRow }).row.id)).toEqual(['r-p2', 'r-p1', 'r-p3', 'r-p4']);
  });

  it('groups children under the partner who produced them, oldest first', () => {
    const rows: RelationRow[] = [
      partner({ id: 'r-p1', partnerId: 'p1', startDate: '1840-01-01' }),
      partner({ id: 'r-p2', partnerId: 'p2', startDate: '1860-01-01' }),
      child({ id: 'r-c1', childId: 'c1', otherParentId: 'p1', birthDate: '1841-04-04' }),
      child({ id: 'r-c2', childId: 'c2', otherParentId: 'p1', birthDate: '1839-01-01' }),
      child({ id: 'r-c3', childId: 'c3', otherParentId: 'p2', birthDate: '1862-12-25' }),
    ];

    const groups = run(rows);
    const partnerGroups = groups.filter(g => g.kind === 'partner') as Extract<RelationsSortGroup, { kind: 'partner' }>[];
    expect(partnerGroups.length).toBe(2);

    expect(partnerGroups[0].row.id).toBe('r-p1');
    expect(partnerGroups[0].children.map(c => c.id)).toEqual(['r-c2', 'r-c1']);

    expect(partnerGroups[1].row.id).toBe('r-p2');
    expect(partnerGroups[1].children.map(c => c.id)).toEqual(['r-c3']);
  });

  it('places children with null/unrecognised other parent in the children-no-partner bucket', () => {
    const rows: RelationRow[] = [
      partner({ id: 'r-p1', partnerId: 'p1', startDate: '1840-01-01' }),
      child({ id: 'r-c1', childId: 'c1', otherParentId: 'p1', birthDate: '1841-04-04' }),
      child({ id: 'r-c2', childId: 'c2', otherParentId: null, birthDate: '1845-04-04' }),
      // other parent points to someone NOT among focal's partners → orphan bucket
      child({ id: 'r-c3', childId: 'c3', otherParentId: 'someone-else', birthDate: '1839-01-01' }),
    ];

    const groups = run(rows);
    const orphan = groups.find(g => g.kind === 'children-no-partner');
    expect(orphan).toBeDefined();
    if (orphan && orphan.kind === 'children-no-partner') {
      // oldest first by birth_date
      expect(orphan.children.map(c => c.id)).toEqual(['r-c3', 'r-c2']);
    }
  });

  it('emits the children-no-partner bucket AFTER all partner rows (last partner-like entry)', () => {
    const rows: RelationRow[] = [
      partner({ id: 'r-p1', partnerId: 'p1', startDate: '1840-01-01' }),
      child({ id: 'r-c1', childId: 'c1', otherParentId: 'p1', birthDate: '1841-04-04' }),
      child({ id: 'r-orphan', childId: 'orphan', otherParentId: null }),
      other({ id: 'r-gp', type: 'godparent', otherId: 'gp', name: 'Anders' }),
    ];
    const groups = run(rows);
    const kinds = groups.map(g => g.kind);
    const partnerIdx = kinds.indexOf('partner');
    const orphanIdx = kinds.indexOf('children-no-partner');
    const otherIdx = kinds.indexOf('other');
    expect(partnerIdx).toBeLessThan(orphanIdx);
    expect(orphanIdx).toBeLessThan(otherIdx);
  });

  it('emits godparents (family-flavoured) before group memberships (social)', () => {
    const rows: RelationRow[] = [
      other({ id: 'r-other', type: 'other', otherId: 'x1', name: 'Albin', subtype: 'colleague' }),
      other({ id: 'r-gp', type: 'godparent', otherId: 'gp1', name: 'Bertil' }),
    ];
    const groups = run(rows);
    const others = groups.filter(g => g.kind === 'other') as Extract<RelationsSortGroup, { kind: 'other' }>[];
    expect(others[0].row.id).toBe('r-gp');
    expect(others[1].row.id).toBe('r-other');
  });

  it('sub-sorts other relations alphabetically using Swedish collation (å, ä, ö after z)', () => {
    const rows: RelationRow[] = [
      other({ id: 'r-zorro', type: 'godparent', otherId: 'z1', name: 'Zorro' }),
      other({ id: 'r-anna', type: 'godparent', otherId: 'a1', name: 'Anna' }),
      other({ id: 'r-asa', type: 'godparent', otherId: 'aa1', name: 'Åsa' }),
      other({ id: 'r-orjan', type: 'godparent', otherId: 'o1', name: 'Örjan' }),
    ];
    const groups = run(rows, 'sv');
    const others = groups.filter(g => g.kind === 'other') as Extract<RelationsSortGroup, { kind: 'other' }>[];
    // Swedish: A → ... → Z → Å → Ä → Ö
    expect(others.map(o => o.row.other.display_name)).toEqual(['Anna', 'Zorro', 'Åsa', 'Örjan']);
  });

  it('sub-sorts other relations using English collation (Å folds into A)', () => {
    const rows: RelationRow[] = [
      other({ id: 'r-zorro', type: 'godparent', otherId: 'z1', name: 'Zorro' }),
      other({ id: 'r-asa', type: 'godparent', otherId: 'aa1', name: 'Åsa' }),
      other({ id: 'r-anna', type: 'godparent', otherId: 'a1', name: 'Anna' }),
    ];
    const groups = run(rows, 'en');
    const others = groups.filter(g => g.kind === 'other') as Extract<RelationsSortGroup, { kind: 'other' }>[];
    // English: Å treated as A, so Åsa sorts somewhere among A names
    const names = others.map(o => o.row.other.display_name);
    expect(names[names.length - 1]).toBe('Zorro');
    // Anna and Åsa both start with "A"-equivalent — Anna < Åsa under base sensitivity
    expect(names.indexOf('Anna')).toBeLessThan(names.indexOf('Åsa'));
  });

  it('produces a stable, fully-ordered result for a complex fixture (snapshot of order)', () => {
    const rows: RelationRow[] = [
      // Parents
      parent({ id: 'r-dad-bio', parentId: 'dad', parentSex: 'M', subtype: 'biological', name: 'Bo' }),
      parent({ id: 'r-mom-bio', parentId: 'mom', parentSex: 'F', subtype: 'biological', name: 'Anna' }),
      parent({ id: 'r-adad', parentId: 'adad', parentSex: 'M', subtype: 'adopted', name: 'Carl' }),

      // Partners — chronological by start_date
      partner({ id: 'r-p2', partnerId: 'p2', startDate: '1862-01-01' }),
      partner({ id: 'r-p1', partnerId: 'p1', startDate: '1840-06-01' }),

      // Children
      child({ id: 'r-c1', childId: 'c1', otherParentId: 'p1', birthDate: '1841-01-01' }),
      child({ id: 'r-c2', childId: 'c2', otherParentId: 'p1', birthDate: '1843-01-01' }),
      child({ id: 'r-c3', childId: 'c3', otherParentId: 'p2', birthDate: '1864-01-01' }),
      child({ id: 'r-c4', childId: 'c4', otherParentId: null, birthDate: null }),

      // Other relations
      other({ id: 'r-gp', type: 'godparent', otherId: 'gp', name: 'Bertil' }),
      other({ id: 'r-grp', type: 'other', otherId: 'grp1', name: 'Grannskapsförening' }),
    ];

    const groups = run(rows);

    // Sequence of kinds — what the renderer walks
    expect(groups.map(g => g.kind)).toEqual([
      'parent', 'parent', 'parent',         // bio dad, bio mom, adopted dad
      'partner', 'partner',                  // p1 (1840), p2 (1862)
      'children-no-partner',                 // orphan child c4
      'other', 'other',                      // godparent first, then social
    ]);

    const p1 = groups[3] as Extract<RelationsSortGroup, { kind: 'partner' }>;
    expect(p1.row.id).toBe('r-p1');
    expect(p1.children.map(c => c.id)).toEqual(['r-c1', 'r-c2']);

    const p2 = groups[4] as Extract<RelationsSortGroup, { kind: 'partner' }>;
    expect(p2.row.id).toBe('r-p2');
    expect(p2.children.map(c => c.id)).toEqual(['r-c3']);
  });

  it('is deterministic — same input, same output, run twice', () => {
    const rows: RelationRow[] = [
      parent({ id: 'r1', parentId: 'mom', parentSex: 'F', subtype: 'biological' }),
      parent({ id: 'r2', parentId: 'dad', parentSex: 'M', subtype: 'biological' }),
      partner({ id: 'r3', partnerId: 'p', startDate: '1840' }),
      child({ id: 'r4', childId: 'c', otherParentId: 'p' }),
    ];
    const a = run(rows);
    const b = run(rows);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
