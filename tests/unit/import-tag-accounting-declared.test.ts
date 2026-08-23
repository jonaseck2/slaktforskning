// The declared-unmapped list is how a tag stops being a silent drop and becomes
// a decision. See docs/plans/2026-08-23-importer-tag-accounting.md Task 5.

import { describe, it, expect } from 'vitest';
import { DECLARED_UNMAPPED, matchDeclared } from '../../src/import/gedcom/accounting-declared';

describe('declared unmapped tags', () => {
  it('matches an exact path', () => {
    expect(matchDeclared('SOUR._AID')?.reason).toMatch(/arkivdigital/i);
  });

  it('matches a leading wildcard suffix under any parent event', () => {
    expect(matchDeclared('INDI.BIRT.PLAC._ADPL._PARISH')).toBeDefined();
    expect(matchDeclared('INDI.RESI.PLAC._ADPL._PARISH')).toBeDefined();
    expect(matchDeclared('FAM.MARR.PLAC._ADPL._PARISH')).toBeDefined();
  });

  it('returns undefined for an undeclared path', () => {
    expect(matchDeclared('INDI.SOMETHING_NOBODY_DECLARED')).toBeUndefined();
  });

  it('rejects a bare catch-all — every entry must name something', () => {
    for (const d of DECLARED_UNMAPPED) {
      expect(d.path, 'a bare "*" declares everything and defeats the test').not.toBe('*');
      expect(d.path.length, `overly broad pattern: ${d.path}`).toBeGreaterThan(3);
    }
  });

  it('every entry carries a non-empty reason', () => {
    for (const d of DECLARED_UNMAPPED) {
      expect(d.reason.trim().length, `empty reason for ${d.path}`).toBeGreaterThan(0);
    }
  });

  it('every reason uses a recognised prefix, so nobody can shrug in prose', () => {
    for (const d of DECLARED_UNMAPPED) {
      expect(d.reason, `unrecognised reason prefix on ${d.path}`)
        .toMatch(/^(excluded:not-relevant|excluded:structural|excluded:redundant|excluded:profile-gated|unmapped:pending-)/);
    }
  });
});
