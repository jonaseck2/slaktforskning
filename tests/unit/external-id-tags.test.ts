/**
 * Unit tests for the two external-identifier tag shapes.
 *
 * These are pure-function tests: no database, no export, no import. The
 * round-trip behaviour they underwrite is asserted end-to-end in
 * `external-identifier-roundtrip.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import type { ExternalIdentifier } from '../../src/api/external_identifiers';
import {
  VENDOR_CARRIED_PAIRS,
  vendorPairKey,
  UNTYPED_SYSTEM,
  generic,
  emitRecordExternalIds,
  emitSubstructureExternalIds,
  readExternalIds,
} from '../../src/gedcom/external-id-tags';
import { parseGedcom, type GedcomNode } from '../../src/gedcom/parser';
import { getChild, getChildren } from '../../src/import/gedcom/node-utils';

/**
 * A row. `entity_type` defaults to `source` because that is the record the
 * emit tests use; the vendor rule is a property of the pair, so every test
 * that cares states the entity type explicitly.
 */
function ident(system: string, value: string, entity_type = 'source'): ExternalIdentifier {
  return {
    id: 'row-' + entity_type + '-' + system + '-' + value,
    entity_type,
    entity_id: 'entity-1',
    system,
    value,
    created_at: '2026-08-29 00:00:00',
  };
}

/** Parse a GEDCOM fragment and return its single root node. */
function parseOne(text: string): GedcomNode {
  const roots = parseGedcom(text);
  expect(roots).toHaveLength(1);
  return roots[0];
}

describe('VENDOR_CARRIED_PAIRS', () => {
  it('names exactly the three (entity_type, system) pairs with a vendor emit site', () => {
    // A census, not a sample: if a fourth vendor tag is added to the exporter
    // without being listed here, its row is emitted twice.
    expect([...VENDOR_CARRIED_PAIRS].sort()).toEqual([
      vendorPairKey('citation', 'arkivdigital.image'),
      vendorPairKey('place', 'arkivdigital.parish'),
      vendorPairKey('source', 'arkivdigital'),
    ].sort());
  });

  it('is keyed on the pair, so the same system differs by entity type', () => {
    // The design spec's carrier table gives `repository` and `media` a vendor
    // override of "none". Keying on the system alone dropped both cells.
    expect(VENDOR_CARRIED_PAIRS.has(vendorPairKey('source', 'arkivdigital'))).toBe(true);
    expect(VENDOR_CARRIED_PAIRS.has(vendorPairKey('repository', 'arkivdigital'))).toBe(false);
    expect(VENDOR_CARRIED_PAIRS.has(vendorPairKey('citation', 'arkivdigital.image'))).toBe(true);
    expect(VENDOR_CARRIED_PAIRS.has(vendorPairKey('media', 'arkivdigital.image'))).toBe(false);
  });
});

describe('generic()', () => {
  it('filters out every vendor-carried pair and keeps the rest', () => {
    const rows = [
      ident('arkivdigital', 'v1', 'source'),
      ident('arkivdigital.parish', 'p1', 'place'),
      ident('arkivdigital.image', 'i1', 'citation'),
      ident('gramps.handle', 'g1'),
      ident(UNTYPED_SYSTEM, 'r1'),
    ];
    expect(generic(rows).map(r => r.system)).toEqual(['gramps.handle', UNTYPED_SYSTEM]);
  });

  it('keeps a vendor system that is on an entity type with no vendor tag', () => {
    // Matrix cells 3 and 5. `arkivdigital` on a repository and
    // `arkivdigital.image` on a media have no vendor emit site, so the generic
    // tag is their only carrier — filtering them out lost the row entirely.
    const rows = [
      ident('arkivdigital', 'v200002', 'repository'),
      ident('arkivdigital.image', 'v300003.1', 'media'),
    ];
    expect(generic(rows).map(r => r.value)).toEqual(['v200002', 'v300003.1']);
  });

  it('returns nothing when every row is vendor-carried', () => {
    // The arm that can return zero. Without it the filter above proves only
    // existence, not that the vendor rows are actually excluded.
    const rows = [ident('arkivdigital', 'v1', 'source'), ident('arkivdigital.image', 'i1', 'citation')];
    expect(generic(rows)).toEqual([]);
  });
});

describe('emitRecordExternalIds()', () => {
  it('emits REFN under 5.5.1', () => {
    const lines: string[] = [];
    emitRecordExternalIds(lines, [ident('gramps.handle', 'g1')], 1, '5.5.1');
    expect(lines).toEqual(['1 REFN g1', '2 TYPE gramps.handle']);
  });

  it('emits EXID under 7.0', () => {
    const lines: string[] = [];
    emitRecordExternalIds(lines, [ident('gramps.handle', 'g1')], 1, '7.0');
    expect(lines).toEqual(['1 EXID g1', '2 TYPE gramps.handle']);
  });

  it('emits no TYPE for the untyped system', () => {
    const lines: string[] = [];
    emitRecordExternalIds(lines, [ident(UNTYPED_SYSTEM, 'r1')], 1, '5.5.1');
    expect(lines).toEqual(['1 REFN r1']);
  });

  it('emits nothing for a vendor-carried pair', () => {
    const lines: string[] = [];
    emitRecordExternalIds(lines, [ident('arkivdigital', 'v100001', 'source')], 1, '5.5.1');
    expect(lines).toEqual([]);
  });

  it('emits the same system when it sits on an entity type with no vendor tag', () => {
    const lines: string[] = [];
    emitRecordExternalIds(lines, [ident('arkivdigital', 'v200002', 'repository')], 1, '5.5.1');
    expect(lines).toEqual(['1 REFN v200002', '2 TYPE arkivdigital']);
  });

  it('honours the level argument', () => {
    const lines: string[] = [];
    emitRecordExternalIds(lines, [ident('gramps.handle', 'g1')], 2, '5.5.1');
    expect(lines).toEqual(['2 REFN g1', '3 TYPE gramps.handle']);
  });
});

describe('emitSubstructureExternalIds()', () => {
  it('emits _EXID with the same bytes under both versions', () => {
    // No version parameter by construction: the tag is custom, so 5.5.1 and
    // 7.0 cannot diverge.
    const lines: string[] = [];
    emitSubstructureExternalIds(lines, [ident('gramps.handle', 'g1')], 3);
    expect(lines).toEqual(['3 _EXID g1', '4 TYPE gramps.handle']);
  });

  it('emits no TYPE for the untyped system', () => {
    const lines: string[] = [];
    emitSubstructureExternalIds(lines, [ident(UNTYPED_SYSTEM, 'r1')], 3);
    expect(lines).toEqual(['3 _EXID r1']);
  });

  it('emits nothing for a vendor-carried pair', () => {
    const lines: string[] = [];
    emitSubstructureExternalIds(lines, [ident('arkivdigital.image', 'i1', 'citation')], 3);
    expect(lines).toEqual([]);
  });
});

describe('readExternalIds()', () => {
  it('reads a TYPE-carrying REFN back with that system', () => {
    const node = parseOne('0 @S1@ SOUR\n1 REFN g1\n2 TYPE gramps.handle\n');
    expect(readExternalIds(node, ['REFN', 'EXID'], 'source', 's-1', getChild, getChildren))
      .toEqual([{ entity_type: 'source', entity_id: 's-1', system: 'gramps.handle', value: 'g1' }]);
  });

  it('reads an untyped REFN back as the untyped system', () => {
    const node = parseOne('0 @S1@ SOUR\n1 REFN r1\n');
    expect(readExternalIds(node, ['REFN', 'EXID'], 'source', 's-1', getChild, getChildren))
      .toEqual([{ entity_type: 'source', entity_id: 's-1', system: UNTYPED_SYSTEM, value: 'r1' }]);
  });

  it('reads a TYPE-carrying EXID back with that system', () => {
    const node = parseOne('0 @S1@ SOUR\n1 EXID g1\n2 TYPE gramps.handle\n');
    expect(readExternalIds(node, ['REFN', 'EXID'], 'source', 's-1', getChild, getChildren))
      .toEqual([{ entity_type: 'source', entity_id: 's-1', system: 'gramps.handle', value: 'g1' }]);
  });

  it('reads the substructure _EXID shape', () => {
    const node = parseOne('0 @I1@ INDI\n1 SOUR @S1@\n2 _EXID g1\n3 TYPE gramps.handle\n');
    const sour = getChild(node, 'SOUR')!;
    expect(readExternalIds(sour, ['_EXID'], 'citation', 'c-1', getChild, getChildren))
      .toEqual([{ entity_type: 'citation', entity_id: 'c-1', system: 'gramps.handle', value: 'g1' }]);
  });

  it('reads every occurrence, not just the first', () => {
    const node = parseOne('0 @S1@ SOUR\n1 REFN a\n2 TYPE sys.a\n1 REFN b\n2 TYPE sys.b\n');
    expect(readExternalIds(node, ['REFN'], 'source', 's-1', getChild, getChildren).map(r => r.value))
      .toEqual(['a', 'b']);
  });

  it('returns nothing when the node carries none of the tags', () => {
    // The arm that can return zero.
    const node = parseOne('0 @S1@ SOUR\n1 TITL Kyrkobok\n');
    expect(readExternalIds(node, ['REFN', 'EXID'], 'source', 's-1', getChild, getChildren))
      .toEqual([]);
  });

  it('skips a tag with an empty value rather than writing an empty row', () => {
    const node = parseOne('0 @S1@ SOUR\n1 REFN\n1 REFN g1\n2 TYPE gramps.handle\n');
    expect(readExternalIds(node, ['REFN'], 'source', 's-1', getChild, getChildren).map(r => r.value))
      .toEqual(['g1']);
  });
});

describe('emit → read symmetry', () => {
  for (const version of ['5.5.1', '7.0'] as const) {
    it(`a record identifier survives emit → parse → read under ${version}`, () => {
      const lines: string[] = ['0 @S1@ SOUR'];
      emitRecordExternalIds(lines, [ident('gramps.handle', 'g1'), ident(UNTYPED_SYSTEM, 'r1')], 1, version);
      const node = parseOne(lines.join('\n') + '\n');
      expect(readExternalIds(node, ['REFN', 'EXID'], 'source', 's-1', getChild, getChildren))
        .toEqual([
          { entity_type: 'source', entity_id: 's-1', system: 'gramps.handle', value: 'g1' },
          { entity_type: 'source', entity_id: 's-1', system: UNTYPED_SYSTEM, value: 'r1' },
        ]);
    });
  }

  it('a substructure identifier survives emit → parse → read', () => {
    const lines: string[] = ['0 @I1@ INDI', '1 SOUR @S1@'];
    emitSubstructureExternalIds(lines, [ident('gramps.handle', 'g1')], 2);
    const sour = getChild(parseOne(lines.join('\n') + '\n'), 'SOUR')!;
    expect(readExternalIds(sour, ['_EXID'], 'citation', 'c-1', getChild, getChildren))
      .toEqual([{ entity_type: 'citation', entity_id: 'c-1', system: 'gramps.handle', value: 'g1' }]);
  });
});
