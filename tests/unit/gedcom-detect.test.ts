import { describe, it, expect } from 'vitest';
import { detectGedcomVersion } from '../../src/import/gedcom/detect';
import { parseGedcom } from '../../src/gedcom/parser';

describe('detectGedcomVersion', () => {
  it('detects 5.5.1', () => {
    const nodes = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 TRLR');
    expect(detectGedcomVersion(nodes)).toBe('5.5.1');
  });

  it('detects 5.5 as 5.5.1', () => {
    const nodes = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 5.5\n0 TRLR');
    expect(detectGedcomVersion(nodes)).toBe('5.5.1');
  });

  it('detects 5.5.5', () => {
    const nodes = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 5.5.5\n0 TRLR');
    expect(detectGedcomVersion(nodes)).toBe('5.5.5');
  });

  it('detects 7.0', () => {
    const nodes = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 7.0\n0 TRLR');
    expect(detectGedcomVersion(nodes)).toBe('7.0');
  });

  it('returns unknown when HEAD missing', () => {
    const nodes = parseGedcom('0 TRLR');
    expect(detectGedcomVersion(nodes)).toBe('unknown');
  });

  it('returns unknown when GEDC missing', () => {
    const nodes = parseGedcom('0 HEAD\n1 SOUR FamilySearch\n0 TRLR');
    expect(detectGedcomVersion(nodes)).toBe('unknown');
  });

  it('returns unknown when VERS missing', () => {
    const nodes = parseGedcom('0 HEAD\n1 GEDC\n2 FORM LINEAGE-LINKED\n0 TRLR');
    expect(detectGedcomVersion(nodes)).toBe('unknown');
  });

  it('returns unknown for unrecognised version string', () => {
    const nodes = parseGedcom('0 HEAD\n1 GEDC\n2 VERS 6.0\n0 TRLR');
    expect(detectGedcomVersion(nodes)).toBe('unknown');
  });
});
