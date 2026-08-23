// Pure ArkivDigital profile logic — detection and tag mapping, no database.
// See docs/plans/2026-08-23-arkivdigital-profile.md Tasks 1, 2, 10.

import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { isArkivDigital, parseAdpl, parseAdplJudicial } from '../../src/import/gedcom/profiles/arkivdigital';
import type { GedcomNode } from '../../src/gedcom/parser';

const HEAD = (sour: string): ReturnType<typeof parseGedcom> => parseGedcom(`0 HEAD
1 SOUR ${sour}
1 GEDC
2 VERS 5.5.1
0 TRLR
`);

describe('isArkivDigital', () => {
  it('recognises the ArkivDigital header signature', () => {
    expect(isArkivDigital(HEAD('Arkiv_Digital'))).toBe(true);
  });

  it('is case- and separator-tolerant, because vendors drift', () => {
    expect(isArkivDigital(HEAD('arkiv_digital'))).toBe(true);
    expect(isArkivDigital(HEAD('ArkivDigital'))).toBe(true);
  });

  it('does not claim another vendor file', () => {
    for (const s of ['Gramps', 'RootsMagic', 'Genney', 'Holger', 'MyHeritage']) {
      expect(isArkivDigital(HEAD(s)), s).toBe(false);
    }
  });

  it('returns false when HEAD.SOUR is absent', () => {
    expect(isArkivDigital(parseGedcom('0 HEAD\n0 TRLR\n'))).toBe(false);
  });
});

// ── Task 2: _ADPL → typed levels ───────────────────────────────────────────

function placOf(ged: string): GedcomNode {
  const found: GedcomNode[] = [];
  const walk = (ns: GedcomNode[]): void => {
    for (const n of ns) { if (n.tag === 'PLAC') found.push(n); walk(n.children); }
  };
  walk(parseGedcom(ged));
  return found[0];
}

const FULL = `0 @I1@ INDI
1 BIRT
2 PLAC Högnäs, Hedesunda, Gävleborgs län, Sverige
3 _ADPL
4 _LOCALITY Högnäs
4 _PARISH_AID a3096
4 _PARISH Hedesunda
4 _COUNTY Gävleborgs län
4 _COUNTRY Sverige
`;

describe('parseAdpl', () => {
  it('returns levels outermost-first with the parish id attached', () => {
    expect(parseAdpl(placOf(FULL))).toEqual([
      { name: 'Sverige', type: 'country' },
      { name: 'Gävleborgs län', type: 'admin1' },
      { name: 'Hedesunda', type: 'parish', externalId: 'a3096' },
      { name: 'Högnäs', type: 'locality' },
    ]);
  });

  it('skips levels the block omits — a country-only place is one level', () => {
    const ged = '0 @I1@ INDI\n1 BIRT\n2 PLAC Sverige\n3 _ADPL\n4 _COUNTRY Sverige\n';
    expect(parseAdpl(placOf(ged))).toEqual([{ name: 'Sverige', type: 'country' }]);
  });

  it('carries _JUDICIAL as a parish attribute, not its own level', () => {
    const ged = '0 @I1@ INDI\n1 PROB\n2 PLAC Valbo\n3 _ADPL\n4 _PARISH Valbo\n4 _JUDICIAL Gästriklands östra tingslags häradsrätt\n4 _COUNTRY Sverige\n';
    expect(parseAdpl(placOf(ged))?.map(l => l.type)).toEqual(['country', 'parish']);
    expect(parseAdplJudicial(placOf(ged))).toBe('Gästriklands östra tingslags häradsrätt');
  });

  it('returns null when the PLAC has no _ADPL block', () => {
    expect(parseAdpl(placOf('0 @I1@ INDI\n1 BIRT\n2 PLAC Nowhere\n'))).toBeNull();
    expect(parseAdplJudicial(placOf('0 @I1@ INDI\n1 BIRT\n2 PLAC Nowhere\n'))).toBeNull();
  });

  it('ignores empty level values rather than creating a nameless place', () => {
    const ged = '0 @I1@ INDI\n1 BIRT\n2 PLAC X\n3 _ADPL\n4 _LOCALITY\n4 _PARISH Valbo\n4 _COUNTRY Sverige\n';
    expect(parseAdpl(placOf(ged))?.map(l => l.name)).toEqual(['Sverige', 'Valbo']);
  });
});
