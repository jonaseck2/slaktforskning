import { describe, it, expect } from 'vitest';
import { getParentChildRoleLabel, resolveParentSexAt } from '../../src/renderer/utils/relationshipLabels';

// Identity t-function: returns the key, lets us assert which key the helper
// resolved to without booting the i18n machinery.
const idT = (key: string) => key;

describe('getParentChildRoleLabel', () => {
  it.each([
    ['parent', 'biological', 'relationshipRoles.parent_biological'],
    ['parent', 'adopted', 'relationshipRoles.parent_adopted'],
    ['parent', 'foster', 'relationshipRoles.parent_foster'],
    ['parent', 'step', 'relationshipRoles.parent_step'],
    ['parent', 'unknown', 'relationshipRoles.parent_unknown'],
    ['child', 'biological', 'relationshipRoles.child_biological'],
    ['child', 'adopted', 'relationshipRoles.child_adopted'],
    ['child', 'foster', 'relationshipRoles.child_foster'],
    ['child', 'step', 'relationshipRoles.child_step'],
    ['child', 'unknown', 'relationshipRoles.child_unknown'],
  ] as const)('direction=%s subtype=%s → %s', (dir, sub, expected) => {
    expect(getParentChildRoleLabel(idT, dir, sub)).toBe(expected);
  });

  it('falls back to <direction>_unknown for null subtype', () => {
    expect(getParentChildRoleLabel(idT, 'parent', null)).toBe('relationshipRoles.parent_unknown');
    expect(getParentChildRoleLabel(idT, 'child', null)).toBe('relationshipRoles.child_unknown');
  });

  it('falls back to <direction>_unknown for undefined subtype', () => {
    expect(getParentChildRoleLabel(idT, 'parent', undefined)).toBe('relationshipRoles.parent_unknown');
  });

  it('falls back to <direction>_unknown for unrecognised subtype string', () => {
    expect(getParentChildRoleLabel(idT, 'child', 'wat')).toBe('relationshipRoles.child_unknown');
  });
});

// Plan: 2026-05-06-sex-change-guard-phase1-data-layer.md
// Pure-function resolver that derives the parent's sex at an arbitrary
// point in time from authored gender_transition events. Used at render
// time only — the DB always stores the *current* sex.
describe('resolveParentSexAt', () => {
  it('no transitions → returns parentCurrentSex unchanged', () => {
    expect(resolveParentSexAt([], 'M', '1990-01-01')).toBe('M');
    expect(resolveParentSexAt([], 'F', '1990-01-01')).toBe('F');
    // Even with non-transition events present, only gender_transition matters.
    const noise = [
      { event_type: 'birth', date_value: '1950-05-01' },
      { event_type: 'death', date_value: '2020-12-31' },
    ];
    expect(resolveParentSexAt(noise, 'M', '1990-01-01')).toBe('M');
  });

  it('one transition with asOfIso BEFORE the transition → returns the OPPOSITE of parentCurrentSex (pre-transition identity)', () => {
    const events = [{ event_type: 'gender_transition', date_value: '2020-01-01' }];
    // Currently F; before 2020 they were M.
    expect(resolveParentSexAt(events, 'F', '2010-01-01')).toBe('M');
    // Currently M; before 2020 they were F.
    expect(resolveParentSexAt(events, 'M', '2010-01-01')).toBe('F');
  });

  it('one transition with asOfIso AFTER the transition → returns parentCurrentSex (post-transition identity)', () => {
    const events = [{ event_type: 'gender_transition', date_value: '2020-01-01' }];
    expect(resolveParentSexAt(events, 'F', '2025-01-01')).toBe('F');
    expect(resolveParentSexAt(events, 'M', '2025-01-01')).toBe('M');
  });

  it('asOfIso === null → returns parentCurrentSex (current/unknown date defaults to live identity)', () => {
    const events = [{ event_type: 'gender_transition', date_value: '2020-01-01' }];
    expect(resolveParentSexAt(events, 'F', null)).toBe('F');
    expect(resolveParentSexAt(events, 'M', undefined)).toBe('M');
  });

  it('two transitions, walks the chain: M→F at 2010, F→M at 2025; current=M; asOf=2015→F, asOf=2030→M, asOf=2005→M', () => {
    // Current sex = M (post-most-recent-transition, i.e. after 2025 F→M).
    // History: M up to 2010, F from 2010-2025, M from 2025 onwards.
    const events = [
      { event_type: 'gender_transition', date_value: '2010-01-01' },
      { event_type: 'gender_transition', date_value: '2025-01-01' },
    ];
    expect(resolveParentSexAt(events, 'M', '2015-01-01')).toBe('F'); // between transitions
    expect(resolveParentSexAt(events, 'M', '2030-01-01')).toBe('M'); // after last
    expect(resolveParentSexAt(events, 'M', '2005-01-01')).toBe('M'); // before first
  });

  it('transitions are sorted before walking even if the input array is unordered', () => {
    // Same setup as above but events provided in reverse order.
    const events = [
      { event_type: 'gender_transition', date_value: '2025-01-01' },
      { event_type: 'gender_transition', date_value: '2010-01-01' },
    ];
    expect(resolveParentSexAt(events, 'M', '2015-01-01')).toBe('F');
    expect(resolveParentSexAt(events, 'M', '2030-01-01')).toBe('M');
    expect(resolveParentSexAt(events, 'M', '2005-01-01')).toBe('M');
  });

  it('U is preserved across the chain — gender_transition does not move someone into or out of unknown', () => {
    const events = [{ event_type: 'gender_transition', date_value: '2020-01-01' }];
    expect(resolveParentSexAt(events, 'U', '2010-01-01')).toBe('U');
    expect(resolveParentSexAt(events, 'U', '2025-01-01')).toBe('U');
    expect(resolveParentSexAt(events, 'U', null)).toBe('U');
  });

  it('non-gender_transition events are ignored (only the gender_transition rows drive the chain)', () => {
    const events = [
      { event_type: 'birth', date_value: '1980-01-01' },
      { event_type: 'gender_transition', date_value: '2020-01-01' },
      { event_type: 'marriage', date_value: '2005-06-15' },
    ];
    expect(resolveParentSexAt(events, 'F', '2010-01-01')).toBe('M');
    expect(resolveParentSexAt(events, 'F', '2025-01-01')).toBe('F');
  });
});
