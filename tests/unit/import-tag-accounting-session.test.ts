// Prime Directive (cont.) clause 1 — the accounting session that records which
// nodes a phase actually read. See docs/plans/2026-08-23-importer-tag-accounting.md.

import { describe, it, expect, afterEach } from 'vitest';
import { beginAccounting, endAccounting, markConsumed, isAccounting } from '../../src/import/gedcom/tag-accounting';
import type { GedcomNode } from '../../src/gedcom/parser';

const node = (tag: string): GedcomNode => ({ level: 1, xref: null, tag, value: '', children: [] });

afterEach(() => { if (isAccounting()) endAccounting(); });

describe('tag accounting session', () => {
  it('collects marked nodes between begin and end', () => {
    const a = node('NAME');
    beginAccounting();
    markConsumed(a);
    expect(endAccounting().has(a)).toBe(true);
  });

  it('marking outside a session is a no-op, not a crash', () => {
    expect(isAccounting()).toBe(false);
    expect(() => markConsumed(node('SEX'))).not.toThrow();
  });

  it('each session starts empty', () => {
    const a = node('NAME');
    beginAccounting(); markConsumed(a); endAccounting();
    beginAccounting();
    expect(endAccounting().has(a)).toBe(false);
  });

  it('refuses a nested session rather than silently merging two imports', () => {
    beginAccounting();
    expect(() => beginAccounting()).toThrow(/already active/i);
  });

  it('endAccounting without begin throws', () => {
    expect(() => endAccounting()).toThrow(/no active/i);
  });
});
