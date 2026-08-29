// The declared-unmapped list is how a tag stops being a silent drop and becomes
// a decision. See docs/plans/2026-08-23-importer-tag-accounting.md Task 5.

import { describe, it, expect } from 'vitest';
import { DECLARED_UNMAPPED, matchDeclared } from '../../src/import/gedcom/accounting-declared';

describe('declared unmapped tags', () => {
  it('matches an exact path', () => {
    // SOUR._AID used to live here; the arkivdigital profile maps it now.
    expect(matchDeclared('INDI._LIVING')?.reason).toMatch(/dialect-tag-review/i);
  });

  it('matches a leading wildcard suffix under any parent', () => {
    // _DESC used to be the example here; the arkivdigital profile maps it now.
    expect(matchDeclared('INDI.OBJE._POS')).toBeDefined();
    expect(matchDeclared('FAM.OBJE._POS')).toBeDefined();
    expect(matchDeclared('INDI.NOTE._TAG')).toBeDefined();
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

  // A whole-tag declaration reads as "we don't handle this". `_DATE_TEXT` is
  // handled — for the branch where handling it is unambiguous. The declaration
  // has to say which branch is still open, or it is a shrug again.
  it('_DATE_TEXT is declared only for the branch that is genuinely open', () => {
    const d = matchDeclared('INDI.BIRT._DATE_TEXT');
    expect(d?.reason).toMatch(/^unmapped:pending-ad-unsampled-tags/);
    expect(d?.reason).toContain('no DATE sibling');
  });

  it('the tags Task 2 mapped are no longer declared', () => {
    expect(matchDeclared('FAM._DOMESTIC_PARTNERSHIP')).toBeUndefined();
    expect(matchDeclared('FAM._DOMESTIC_PARTNERSHIP.DATE')).toBeUndefined();
  });

  it('every reason uses a recognised prefix, so nobody can shrug in prose', () => {
    for (const d of DECLARED_UNMAPPED) {
      expect(d.reason, `unrecognised reason prefix on ${d.path}`)
        .toMatch(/^(excluded:not-relevant|excluded:structural|excluded:redundant|excluded:profile-gated|unmapped:pending-)/);
    }
  });
});
