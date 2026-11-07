// Accounting across the normalize boundary (plan 2026-11-07-normalize-boundary-accounting).
//
// User goal: a researcher who imports a GEDCOM 7.0 file is told which parts the
// app did not read, exactly as a 5.5.1 researcher is.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { importGedcom } from '../../src/import/gedcom';
import type { GedcomNode } from '../../src/gedcom/parser';
import {
  beginAccounting,
  endAccounting,
  markConsumed,
  recordOrigin,
  originOf,
} from '../../src/import/gedcom/tag-accounting';
import { detectGedcomVersion, gedcomMajor } from '../../src/import/gedcom/detect';
import { normalizeForImport } from '../../src/import/gedcom/normalize';
import { matchDeclared } from '../../src/import/gedcom/accounting-declared';
import { queryAll } from '../../src/api/db';
import { createTestDb } from './helpers';

// Review Focus 4: a throwing normalize must not strand the accounting session.
// The flag makes the real normalizeForImport throw once, on the next call.
const normalizeFault = vi.hoisted(() => ({ throwNext: false }));
vi.mock('../../src/import/gedcom/normalize', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/import/gedcom/normalize')>();
  return {
    ...real,
    normalizeForImport: (...args: Parameters<typeof real.normalizeForImport>) => {
      if (normalizeFault.throwNext) {
        normalizeFault.throwNext = false;
        throw new Error('injected normalize failure');
      }
      return real.normalizeForImport(...args);
    },
  };
});

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(HERE, '../fixtures/gedcom');

// Verification 1: the spec probe. A shared note carrying LANG and TRAN.
const SNOTE_PROBE = `0 HEAD
1 GEDC
2 VERS 7.0
0 @N1@ SNOTE Anteckning om Anna
1 LANG sv
1 TRAN Note about Anna
2 LANG en
0 @I1@ INDI
1 NAME Anna /Berg/
1 SNOTE @N1@
0 TRLR
`;

describe('normalize-boundary accounting', () => {
  it('reports SNOTE.TRAN and SNOTE.TRAN.LANG and not SNOTE.LANG', async () => {
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(SNOTE_PROBE));
    const paths = (report.unaccountedFor ?? []).map(u => u.path);
    expect(paths, 'SNOTE.TRAN must be named in the report').toContain('SNOTE.TRAN');
    expect(paths, 'SNOTE.TRAN.LANG must be named in the report').toContain('SNOTE.TRAN.LANG');
    expect(paths, 'SNOTE.LANG is read by phases/notes.ts').not.toContain('SNOTE.LANG');
  });

  // Replaces the T01 pinned-behaviour test. detect.ts applies semver by major, so a
  // 7.0.x patch file reaches normalize and its shared-note translation is reported.
  it('an inline GEDC.VERS 7.0.13 file has major 7 and declared version 7.0.13', async () => {
    const text = SNOTE_PROBE.replace('2 VERS 7.0', '2 VERS 7.0.13');
    const version = detectGedcomVersion(parseGedcom(text));
    expect(version).toBe('7.0.13');
    expect(gedcomMajor(version)).toBe(7);
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(text));
    expect(report.version).toBe('7.0.13');
    const paths = (report.unaccountedFor ?? []).map(u => u.path);
    expect(paths).toContain('SNOTE.TRAN');
    expect(paths).toContain('SNOTE.TRAN.LANG');
  });

  // Verification 3: 5.5.1 is stable. The raw list equals the pinned baseline
  // minus the two paths detect.ts will now read.
  const baseline: Record<string, { path: string; count: number }[]> =
    JSON.parse(readFileSync(join(FIXTURES, 'accounting-baseline-551.json'), 'utf-8'));
  const NOW_READ = new Set(['HEAD.GEDC', 'HEAD.GEDC.VERS']);

  it('has a baseline for 20 fixtures', () => {
    expect(Object.keys(baseline).length).toBe(20);
  });

  for (const [rel, expected] of Object.entries(baseline)) {
    it(`${rel} — raw unaccountedFor equals the baseline minus HEAD.GEDC and HEAD.GEDC.VERS`, async () => {
      const db = await createTestDb();
      const report = await importGedcom(db, parseGedcom(readFileSync(join(FIXTURES, rel), 'utf-8')));
      const actual = (report.unaccountedFor ?? []).map(u => ({ path: u.path, count: u.count }));
      expect(actual).toEqual(expected.filter(e => !NOW_READ.has(e.path)));
    });
  }
});

// T03: normalize.ts records provenance for every node it derives. The import
// session still opens after normalize (T04 moves it), so these tests open their own.
describe('normalize records provenance', () => {
  const parsed = () => parseGedcom(readFileSync(join(FIXTURES, 'gedcom7-normalize.ged'), 'utf-8'));
  const kid = (n: GedcomNode, tag: string, i = 0): GedcomNode => {
    const found = n.children.filter(c => c.tag === tag)[i];
    if (!found) throw new Error(`no ${tag}[${i}] under ${n.tag}`);
    return found;
  };
  const rec = (nodes: GedcomNode[], xref: string): GedcomNode => {
    const found = nodes.find(n => n.xref === xref);
    if (!found) throw new Error(`no record ${xref}`);
    return found;
  };
  const walk = (nodes: GedcomNode[], out: GedcomNode[] = []): GedcomNode[] => {
    for (const n of nodes) { out.push(n); walk(n.children, out); }
    return out;
  };

  /** Normalizes inside a session. Origins are read before the session closes. */
  function run(check: (src: GedcomNode[], out: GedcomNode[]) => void): Set<GedcomNode> {
    const src = parsed();
    let consumed!: Set<GedcomNode>;
    beginAccounting();
    try {
      check(src, normalizeForImport(src, '7.0'));
    } finally {
      consumed = endAccounting();
    }
    return consumed;
  }

  it('every node in the normalized tree traces to a parsed node', () => {
    run((src, out) => {
      const parsedSet = new Set(walk(src));
      const orphans = walk(out).filter(n => !parsedSet.has(originOf(n))).map(n => n.tag);
      expect(orphans).toEqual([]);
    });
  });

  it('row 1b: an inlined NOTE comes from its SNOTE pointer (INDI, event and FAM level)', () => {
    run((src, out) => {
      const i1 = rec(src, '@I1@');
      const o1 = rec(out, '@I1@');
      expect(originOf(kid(o1, 'NOTE'))).toBe(kid(i1, 'SNOTE'));
      expect(originOf(kid(kid(o1, 'BIRT'), 'NOTE'))).toBe(kid(kid(i1, 'BIRT'), 'SNOTE'));
      expect(originOf(kid(rec(out, '@F1@'), 'NOTE'))).toBe(kid(rec(src, '@F1@'), 'SNOTE'));
    });
  });

  it('row 2: REFN comes from EXID and its TYPE from the EXID TYPE', () => {
    run((src, out) => {
      const exid = kid(rec(src, '@I1@'), 'EXID');
      const refn = kid(rec(out, '@I1@'), 'REFN');
      expect(originOf(refn)).toBe(exid);
      expect(originOf(kid(refn, 'TYPE'))).toBe(kid(exid, 'TYPE'));
    });
  });

  it('rows 4-6: spread copies trace to their origin', () => {
    run((src, out) => {
      const i1 = rec(src, '@I1@');
      const o1 = rec(out, '@I1@');
      expect(originOf(o1)).toBe(i1);
      expect(originOf(kid(o1, 'SEX'))).toBe(kid(i1, 'SEX'));
      const birtDate = kid(kid(o1, 'BIRT'), 'DATE');
      expect(birtDate.value).toBe('sometime in spring');
      expect(originOf(birtDate)).toBe(kid(kid(i1, 'BIRT'), 'DATE'));
      expect(originOf(kid(kid(o1, 'DEAT'), 'DATE'))).toBe(kid(kid(i1, 'DEAT'), 'DATE'));
    });
  });

  it('row 4: a lowercased TYPE value traces to its origin', () => {
    const src = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 FAMC @F1@\n2 PEDI BIRTH\n0 TRLR');
    beginAccounting();
    try {
      const pedi = kid(kid(rec(normalizeForImport(src, '7.0'), '@I1@'), 'FAMC'), 'PEDI');
      expect(pedi.value).toBe('birth');
      expect(originOf(pedi)).toBe(kid(kid(rec(src, '@I1@'), 'FAMC'), 'PEDI'));
    } finally {
      endAccounting();
    }
  });

  it('row 7: the merged GIVN and SURN come from the first duplicate', () => {
    run((src, out) => {
      const name = kid(rec(src, '@I1@'), 'NAME');
      const outName = kid(rec(out, '@I1@'), 'NAME');
      expect(kid(outName, 'GIVN').value).toBe('Anna Maria');
      expect(originOf(kid(outName, 'GIVN'))).toBe(kid(name, 'GIVN', 0));
      expect(originOf(kid(outName, 'SURN'))).toBe(kid(name, 'SURN', 0));
    });
  });

  it('PHRASE is not marked when the DATE already has a value', () => {
    let phrase!: GedcomNode;
    let used!: GedcomNode;
    const consumed = run(src => {
      const i1 = rec(src, '@I1@');
      phrase = kid(kid(kid(i1, 'DEAT'), 'DATE'), 'PHRASE');
      used = kid(kid(kid(i1, 'BIRT'), 'DATE'), 'PHRASE');
    });
    expect(consumed.has(phrase), 'DEAT.DATE.PHRASE was dropped, so it must be reported').toBe(false);
    expect(consumed.has(used), 'BIRT.DATE.PHRASE replaced the empty value, so it was read').toBe(true);
  });

  it('the second GIVN stays unmarked', () => {
    let second!: GedcomNode;
    let secondSurn!: GedcomNode;
    const consumed = run(src => {
      const name = kid(rec(src, '@I1@'), 'NAME');
      second = kid(name, 'GIVN', 1);
      secondSurn = kid(name, 'SURN', 1);
    });
    expect(consumed.has(second)).toBe(false);
    expect(consumed.has(secondSurn)).toBe(false);
  });

  it('SNOTE record is marked, SNOTE.TRAN is not', () => {
    let snote!: GedcomNode;
    const consumed = run(src => { snote = rec(src, '@N1@'); });
    expect(consumed.has(snote)).toBe(true);
    expect(consumed.has(kid(snote, 'TRAN'))).toBe(false);
    expect(consumed.has(kid(kid(snote, 'TRAN'), 'LANG'))).toBe(false);
  });

  it('EXID children the REFN does not carry stay unmarked', () => {
    let extra!: GedcomNode;
    const consumed = run(src => { extra = kid(kid(rec(src, '@I1@'), 'EXID'), '_SRC'); });
    expect(consumed.has(extra)).toBe(false);
  });
});

describe('accounting provenance', () => {
  const node = (tag: string): GedcomNode => ({ level: 0, xref: null, tag, value: '', children: [] });

  it('marking a derived node marks its origin', () => {
    const origin = node('TRAN');
    const derived = node('TRAN');
    let consumed!: Set<GedcomNode>;
    beginAccounting();
    try {
      recordOrigin(derived, origin);
      markConsumed(derived);
    } finally {
      consumed = endAccounting();
    }
    expect(consumed.has(derived)).toBe(true);
    expect(consumed.has(origin)).toBe(true);
  });

  it('a node derived twice marks the parsed origin once', () => {
    const origin = node('NAME');
    const mid = node('NAME');
    const last = node('NAME');
    let consumed!: Set<GedcomNode>;
    beginAccounting();
    try {
      recordOrigin(mid, origin);
      recordOrigin(last, mid);
      expect(originOf(last)).toBe(origin);
      markConsumed(last);
    } finally {
      consumed = endAccounting();
    }
    expect(consumed.has(origin)).toBe(true);
    expect(consumed.has(last)).toBe(true);
    expect(consumed.has(mid)).toBe(false);
  });

  it('a derived node with no recordOrigin leaves the origin unmarked', () => {
    const origin = node('TRAN');
    const derived = node('TRAN');
    let consumed!: Set<GedcomNode>;
    beginAccounting();
    try {
      markConsumed(derived);
    } finally {
      consumed = endAccounting();
    }
    expect(consumed.has(derived)).toBe(true);
    expect(consumed.has(origin)).toBe(false);
  });

  it('provenance does not leak into the next session', () => {
    const origin = node('TRAN');
    const derived = node('TRAN');
    beginAccounting();
    recordOrigin(derived, origin);
    endAccounting();
    beginAccounting();
    markConsumed(derived);
    const consumed = endAccounting();
    expect(consumed.has(derived)).toBe(true);
    expect(consumed.has(origin)).toBe(false);
  });

  it('recordOrigin outside a session is a no-op and does not throw', () => {
    const a = node('A');
    const b = node('B');
    expect(() => recordOrigin(a, b)).not.toThrow();
    expect(originOf(a)).toBe(a);
  });
});

// T04: detect.ts follows semver. Same major is compatible, a new major is not.
describe('detectGedcomVersion follows semver', () => {
  const detect = (vers: string) => detectGedcomVersion(parseGedcom(`0 HEAD\n1 GEDC\n2 VERS ${vers}\n0 TRLR`));

  const SUPPORTED: [string, number][] = [
    ['7.0', 7], ['7.0.13', 7], ['7.1', 7], ['7.2.3', 7],
    ['5.0', 5], ['5.5', 5], ['5.5.1', 5], ['5.5.5', 5], ['5.6', 5],
  ];
  for (const [vers, major] of SUPPORTED) {
    it(`${vers} → declared string, major ${major}`, () => {
      expect(detect(vers)).toBe(vers);
      expect(gedcomMajor(detect(vers))).toBe(major);
    });
  }

  for (const vers of ['4.0', '6.0', '8.0', '8.1.2', '10.0']) {
    it(`${vers} → unknown (unsupported major)`, () => {
      expect(detect(vers)).toBe('unknown');
      expect(gedcomMajor(detect(vers))).toBeNull();
    });
  }

  for (const vers of ['7', '7.', '7.x', '70.0', '5.5.5.1', '']) {
    it(`'${vers}' → unknown (malformed)`, () => {
      expect(detect(vers)).toBe('unknown');
    });
  }

  it('surrounding whitespace is trimmed', () => {
    expect(detect('  7.0.13  ')).toBe('7.0.13');
  });
});

describe('normalizeForImport keys on the major version', () => {
  const tree = () => parseGedcom('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 FAMC @F1@\n2 PEDI BIRTH\n0 TRLR');
  const pedi = (nodes: GedcomNode[]) =>
    nodes.find(n => n.xref === '@I1@')?.children.find(c => c.tag === 'FAMC')?.children.find(c => c.tag === 'PEDI')?.value;

  for (const v of ['7.0.13', '7.1']) {
    it(`transforms for ${v}`, () => {
      expect(pedi(normalizeForImport(tree(), v))).toBe('birth');
    });
  }
  for (const v of ['5.5', '5.5.5', 'unknown']) {
    it(`is a no-op for ${v}`, () => {
      const input = tree();
      expect(normalizeForImport(input, v)).toBe(input);
    });
  }
});

describe('session lifecycle and pointer edge cases (T04)', () => {
  it('a throwing normalize does not strand the session', async () => {
    normalizeFault.throwNext = true;
    await expect(importGedcom(await createTestDb(), parseGedcom(SNOTE_PROBE))).rejects.toThrow('injected normalize failure');
    const report = await importGedcom(await createTestDb(), parseGedcom(SNOTE_PROBE));
    expect(report.persons).toBe(1);
  });

  it('dangling SNOTE pointer imports without a crash', async () => {
    const text = '0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 NAME Anna /Berg/\n1 SNOTE @N9@\n0 TRLR\n';
    const db = await createTestDb();
    const report = await importGedcom(db, parseGedcom(text));
    expect(report.persons).toBe(1);
    // Measured 2026-11-07: normalize derives an empty NOTE from the pointer and the
    // individuals phase reads it, so INDI.SNOTE is marked through provenance. No
    // notes row is written. The dangling target is not itself named in the report.
    expect((report.unaccountedFor ?? []).map(u => u.path)).toEqual(['TRLR']);
    expect(await queryAll(db, 'SELECT id FROM notes')).toEqual([]);
  });
});

describe('the 7.0 fixture after T04', () => {
  const fixture = () => parseGedcom(readFileSync(join(FIXTURES, 'gedcom7-normalize.ged'), 'utf-8'));

  // Review Focus 5. Measured 2026-11-07 after T04:
  //   INDI.SNOTE       marked (phaseNoteLinks reads the pointer on the parsed tree)
  //   INDI.BIRT.SNOTE  marked (the event phase reads the inlined NOTE; provenance
  //                    carries the mark to the pointer)
  //   FAM.SNOTE        reported. No phase reads a FAM-level NOTE, and phaseNoteLinks
  //                    skips FAM, so the pointer is named in the report.
  it('event-level and FAM-level SNOTE pointers are marked or reported, never silent', async () => {
    const report = await importGedcom(await createTestDb(), fixture());
    const paths = new Set((report.unaccountedFor ?? []).map(u => u.path));
    expect([...paths].filter(p => p.endsWith('SNOTE')).sort()).toEqual(['FAM.SNOTE']);
    expect(paths.has('INDI.SNOTE')).toBe(false);
    expect(paths.has('INDI.BIRT.SNOTE')).toBe(false);
  });

  // Verification 4. T05 declares these. Until then the fixture gate stays red on them.
  it('7.0 fixture: every node a phase reads is marked', async () => {
    const report = await importGedcom(await createTestDb(), fixture());
    const undeclared = (report.unaccountedFor ?? [])
      .filter(u => !matchDeclared(u.path))
      .map(u => `${u.count} ${u.path}`)
      .sort();
    // Measured 2026-11-07. Each is a node no phase reads, not a false positive:
    // DEAT.DATE.PHRASE was dropped because the DATE had a value (Review Focus 1).
    expect(undeclared).toEqual([
      '1 FAM.SNOTE',
      '1 INDI.DEAT.DATE.PHRASE',
      '1 INDI.EXID._SRC',
      '1 SNOTE.TRAN',
      '1 SNOTE.TRAN.LANG',
    ]);
  });
});
