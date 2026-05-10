import { describe, it, expect } from 'vitest';
import { getParentChildRoleLabel } from '../../src/renderer/utils/relationshipLabels';

// Identity t-function: returns the key, lets us assert which key the helper
// resolved to without booting the i18n machinery.
const idT = (key: string) => key;

describe('getParentChildRoleLabel', async () => {
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

  it('falls back to <direction>_unknown for null subtype', async () => {
    expect(getParentChildRoleLabel(idT, 'parent', null)).toBe('relationshipRoles.parent_unknown');
    expect(getParentChildRoleLabel(idT, 'child', null)).toBe('relationshipRoles.child_unknown');
  });

  it('falls back to <direction>_unknown for undefined subtype', async () => {
    expect(getParentChildRoleLabel(idT, 'parent', undefined)).toBe('relationshipRoles.parent_unknown');
  });

  it('falls back to <direction>_unknown for unrecognised subtype string', async () => {
    expect(getParentChildRoleLabel(idT, 'child', 'wat')).toBe('relationshipRoles.child_unknown');
  });
});
