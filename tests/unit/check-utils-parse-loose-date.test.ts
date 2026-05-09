/**
 * Regression test for parseLooseDate / extractYear / dateDefinitelyAfter.
 *
 * These helpers are the foundation for every chronological check. The
 * 2026-05-09 Bernadotte session showed that pre-existing checks read
 * SUBSTR(date_value, 1, 4) as the year, which silently parsed the
 * day-of-month from free-text dates ("26 Jan 1763" → year 26). The
 * resulting false positives were 65% of the entire run_checks output
 * on a clean test database. This test pins the behaviour we expect
 * after that fix.
 */
import { describe, it, expect } from 'vitest';
import { parseLooseDate, extractYear, dateDefinitelyAfter } from '../../src/api/checks/check-utils';

describe('parseLooseDate', () => {
  it('parses ISO YYYY', () => {
    expect(parseLooseDate('1763')).toEqual({ y: 1763 });
  });
  it('parses ISO YYYY-MM', () => {
    expect(parseLooseDate('1763-01')).toEqual({ y: 1763, m: 1 });
  });
  it('parses ISO YYYY-MM-DD', () => {
    expect(parseLooseDate('1763-01-26')).toEqual({ y: 1763, m: 1, d: 26 });
  });
  it('parses "26 Jan 1763"', () => {
    expect(parseLooseDate('26 Jan 1763')).toEqual({ y: 1763, m: 1, d: 26 });
  });
  it('parses "8 Mar 1844"', () => {
    expect(parseLooseDate('8 Mar 1844')).toEqual({ y: 1844, m: 3, d: 8 });
  });
  it('parses Swedish month names', () => {
    expect(parseLooseDate('26 januari 1763')).toEqual({ y: 1763, m: 1, d: 26 });
    expect(parseLooseDate('5 maj 1860')).toEqual({ y: 1860, m: 5, d: 5 });
  });
  it('parses month-first English layouts', () => {
    expect(parseLooseDate('Jan 26 1763')).toEqual({ y: 1763, m: 1, d: 26 });
  });
  it('rejects empty / nullish input', () => {
    expect(parseLooseDate('')).toBeNull();
    expect(parseLooseDate(null)).toBeNull();
    expect(parseLooseDate(undefined)).toBeNull();
  });
  it('rejects strings with no recognisable year', () => {
    expect(parseLooseDate('hello')).toBeNull();
    expect(parseLooseDate('not-a-date')).toBeNull();
  });
});

describe('extractYear', () => {
  it('returns the year of a free-text date', () => {
    expect(extractYear('26 Jan 1763')).toBe(1763);
  });
  it('returns the year of an ISO date', () => {
    expect(extractYear('1763-01-26')).toBe(1763);
  });
  it('returns null for empty input', () => {
    expect(extractYear('')).toBeNull();
    expect(extractYear(null)).toBeNull();
  });
});

describe('dateDefinitelyAfter — Bernadotte regression', () => {
  it('Karl XIV Johan (b. 26 Jan 1763) is older than Oscar I (b. 4 Jul 1799) — no PARENT_BORN_AFTER_CHILD', () => {
    expect(dateDefinitelyAfter('26 Jan 1763', '4 Jul 1799')).toBe(false);
    expect(dateDefinitelyAfter('4 Jul 1799', '26 Jan 1763')).toBe(true);
  });
  it('Karl XIV Johan (d. 8 Mar 1844) preceded his burial (26 Apr 1844) — burial is not before death', () => {
    // burial > death = true means "burial is after death", which is the
    // correct chronology and should NOT trigger BURIAL_BEFORE_DEATH.
    expect(dateDefinitelyAfter('26 Apr 1844', '8 Mar 1844')).toBe(true);
  });
  it('a 1763 birth is not in the future', () => {
    const today = new Date().toISOString().substring(0, 10);
    expect(dateDefinitelyAfter('26 Jan 1763', today)).toBe(false);
    expect(dateDefinitelyAfter('1763', today)).toBe(false);
  });
  it('a year-only date does not flag against a fully-specified date in the same year', () => {
    expect(dateDefinitelyAfter('1763', '1763-06-15')).toBe(false);
    expect(dateDefinitelyAfter('1763-06-15', '1763')).toBe(false);
  });
});
