// The declared-unmapped list is how a tag stops being a silent drop and becomes
// a decision. See docs/plans/2026-08-23-importer-tag-accounting.md Task 5.

import { describe, it, expect } from 'vitest';
import { DECLARED_UNMAPPED, matchDeclared } from '../../src/import/gedcom/accounting-declared';

describe('declared unmapped tags', () => {
  it('matches an exact path', () => {
    // SOUR._AID used to live here; the arkivdigital profile maps it now.
    // INDI._LIVING is an exact-path entry: it must resolve to its own row, not
    // to some wildcard that happens to cover it.
    const d = matchDeclared('INDI._LIVING');
    expect(d?.path).toBe('INDI._LIVING');
    expect(d?.reason).toMatch(/^excluded:redundant/);
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

  // ── Task 7: two shipped code paths said different things about _HDP ───────
  // import-core.ts told the user "_HDP / _H8P — Holger internal metadata …
  // nothing was lost", while the declared list called it real authored data
  // awaiting a mapping. A user reading both got no answer. The disclosure is
  // the right one, and the declaration now says so and names it.
  it('_HDP is declared consistently with what the import report already tells the user', () => {
    const d = matchDeclared('INDI._HDP');
    expect(d?.reason).toMatch(/^excluded:not-relevant/);
    expect(d?.reason).toContain('import-core.ts');
  });

  // ── Task 10: the remaining vendor tags, each with its measured count ──────
  // "This holds nothing the researcher wrote" is a judgement, and a judgement
  // with no denominator is a shrug — `.claude/rules/evidence.md`. Every one of
  // these declarations names the program and the count it was measured at.
  it('every vendor-tag declaration names an occurrence count', () => {
    for (const p of ['INDI._PHOTO', 'INDI._MTTAG', 'INDI._WEBTAG', 'INDI._CUSTOM',
                     'INDI._UPD', 'INDI._PPEXCLUDE', 'INDI._SOSADABOVILLE',
                     'INDI.BIRT._UID', 'INDI.DEAT.RIN',
                     'INDI.CHAN', 'FAM.CHAN.DATE', 'SOUR.CHAN.DATE.TIME', 'OBJE.CHAN.NOTE']) {
      const d = matchDeclared(p);
      expect(d, `${p} is undeclared`).toBeDefined();
      expect(d!.reason, `${p} has no count in its reason`).toMatch(/\d+ occurrence/);
    }
  });

  // `*.RIN` covers the event-level identifiers, but OBJE.RIN is a media record
  // id with its own reason. First match wins, so ordering is load-bearing.
  it('an exact path still beats a wildcard that would also cover it', () => {
    expect(matchDeclared('OBJE.RIN')?.path).toBe('OBJE.RIN');
    expect(matchDeclared('INDI.BIRT.RIN')?.path).toBe('*.RIN');
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
