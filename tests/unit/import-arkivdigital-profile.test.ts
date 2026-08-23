// Pure ArkivDigital profile logic — detection and tag mapping, no database.
// See docs/plans/2026-08-23-arkivdigital-profile.md Tasks 1, 2, 10.

import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { isArkivDigital } from '../../src/import/gedcom/profiles/arkivdigital';

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
