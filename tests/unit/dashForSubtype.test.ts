// dashForSubtype: maps a parent_child relationship subtype to its
// stroke-dasharray string for the hourglass chart.
//
// User goal (from docs/plans/2026-05-06-hourglass-foster-vs-adoptive-distinct.md):
//   The genealogist can tell foster from adopted at a glance — they have
//   visually distinct dash patterns. Biological is solid. Step is deferred
//   (treated as foster for now). Unknown is treated as biological so we
//   don't claim authored data we don't have.

import { describe, it, expect } from 'vitest';
import { dashForSubtype } from '../../src/renderer/utils/chart-layout';

describe('dashForSubtype', () => {
  it("biological → 'none' (solid)", () => {
    expect(dashForSubtype('biological')).toBe('none');
  });

  it("foster → '8 4' (long dashes)", () => {
    expect(dashForSubtype('foster')).toBe('8 4');
  });

  it("adopted → '2 3' (dotted)", () => {
    expect(dashForSubtype('adopted')).toBe('2 3');
  });

  it("step → '8 4' (deferred — same as foster for now)", () => {
    expect(dashForSubtype('step')).toBe('8 4');
  });

  it("unknown → 'none' (assume biological — don't fabricate a non-bio claim)", () => {
    expect(dashForSubtype('unknown')).toBe('none');
  });

  it("null → 'none' (no subtype recorded → solid like biological)", () => {
    expect(dashForSubtype(null)).toBe('none');
  });

  it("undefined → 'none' (same as null)", () => {
    expect(dashForSubtype(undefined)).toBe('none');
  });

  it('foster and adopted produce visually distinct patterns (user goal)', () => {
    // The whole point of the plan: a user looking at the chart must be
    // able to tell foster from adopted. If these ever return the same
    // value, the user-observable goal is broken.
    expect(dashForSubtype('foster')).not.toBe(dashForSubtype('adopted'));
  });

  it("adopted dash does not collide with the outline-placeholder dash ('4 3')", () => {
    // Outline placeholder edges use '4 3'. Adopted ('2 3') must remain
    // visually distinct so a placeholder edge is never confused with an
    // adoptive edge.
    expect(dashForSubtype('adopted')).not.toBe('4 3');
  });
});
